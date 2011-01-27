if (typeof(Autocompleter) == 'undefined') { Autocompleter = {}; }

Autocompleter.Json = Class.create(Autocompleter.Base, {
  initialize: function(element, update, lookupFunction, options) {
    options = options || {};
    this.baseInitialize(element, update, options);
    this.lookupFunction = lookupFunction;
    this.options.choices = options.choices || 10;
  },
  
  getUpdatedChoices: function() {
    this.lookupFunction(this.getToken().toLowerCase(), this.updateJsonChoices.bind(this));
  },
  
  updateJsonChoices: function(choices) {
    this.updateChoices('<ul>' + choices.slice(0, this.options.choices).map(this.jsonChoiceToListChoice.bind(this)).join('') + '</ul>');
  },
  
  jsonChoiceToListChoice: function(choice, mark) {
    return '<li>' + choice.escapeHTML() + '</li>';
  }
});

// Schedules the next request
// Only remembers two at a time. The current request, and the waiting request
//
//     rateLimiter = new Autocompleter.RateLimiting();
//     rateLimiter.sendRequest(r1, callback); // sends the first request
//     rateLimiter.sendRequest(r2, callback); // schedules the second request
//
//     // if r1 has not returned
//     //   schedule r3, throw away r2
//     // if r1 has returned
//     //   r2 is the current request, r3 is still scheduled
//     rateLimiter.sendRequest(r3, callback); // if r1 has not returned
//
Autocompleter.RateLimiting = function() {
  this.currentRequest = null;
  this.scheduledRequest = null;
};

Autocompleter.RateLimiting.prototype = {

  schedule: function(f, searchTerm, callback) {
    this.scheduledRequest = { f:f, searchTerm:searchTerm, callback:callback };
    this._sendRequest();
  },

  _sendRequest: function() {
    if (!this.currentRequest) {
      this.currentRequest = this.scheduledRequest;
      this.scheduledRequest = null;

      this.currentRequest.f(this.currentRequest.searchTerm, this._callback.bind(this));
    }
  },

  _callback: function(data) {
    try {
      this.currentRequest.callback(data);
    } catch (e) {
    }
    this.currentRequest = null;

    if (this.scheduledRequest) {
      this._sendRequest();
    }
  }

};

Autocompleter.Cache = Class.create({
  initialize: function(backendLookup, options) {
    this.cache = new Hash();
    this.backendLookup = backendLookup;
    this.rateLimiter = new Autocompleter.RateLimiting();
    this.options = Object.extend({
      choices: 10,
      fuzzySearch: false
    }, options || {});
  },
  
  lookup: function(term, callback) {
    return this._lookupInCache(term, null, callback) ||
      this.rateLimiter.schedule(this.backendLookup, term,
        this._storeInCache.curry(term, callback).bind(this));
  },
  
  _lookupInCache: function(fullTerm, partialTerm, callback) {
    var partialTerm = partialTerm || fullTerm;
    var result = this.cache.get(partialTerm);
    
    if (result == null) {
      if (partialTerm.length > 1) {
        return this._lookupInCache(fullTerm, partialTerm.substr(0, partialTerm.length - 1), callback);
      } else {
        return false;
      };
    } else {
      if (fullTerm != partialTerm) {
        var hasMore = result.length > 0 && result[result.length - 1]['more'] === true;
        result = this._localSearch(result, fullTerm);
        if (!hasMore) {
          this._storeInCache(fullTerm, null, result);
        } else {
          if (result.length < this.options.choices) {
            return false
          };
        };
      };
      if (result.length > 0 && result[result.length - 1]['more'] !== undefined) {
        result = result.slice(0, result.length - 1);
      };
      callback(result.slice(0, this.options.choices));
      return true;
    };
  },
  
  _localSearch: function(data, term) {
    var exp = this.options.fuzzySearch ? new RegExp(term.gsub(/./, ".*#{0}"), 'i') : new RegExp(term, 'i');
    var foundItems = new Array();
    
    //optimized for speed:
    var item = null;
    var name = null;
    for (var i = 0, len = data.length; i < len; ++i) {
      item = data[i];
      if (exp.test(item)) {
        foundItems.push(item);
      };
    }
    
    return foundItems;
  },
  
  _storeInCache: function(term, callback, data) {
    this.cache.set(term, data);
    if (callback) {
      var items = data.slice(0, this.options.choices);
      if (items.length > 1 && items[items.length - 1]['more'] !== undefined) {
        items = items.slice(0, items.length - 1);
      };
      callback(items);
    };
  }
});

Autocompleter.MultiValue = Class.create({
  options: $H({}),
  element: null,
  dataFetcher: null,
  
  createSelectedElement: function(id, title) {
    var closeLink = new Element('a', {className: 'close'}).update('×');
    closeLink.observe('click', function(e) {
      this.removeEntry(e.element().up('li'));
      e.stop();
    }.bind(this));
    var hiddenValueField = new Element('input', {type: 'hidden', name: this.name + '[]', value: id, style: 'display: none;'});
    return new Element('li', { className:'choice', choice_id: id }).insert(('' + title).escapeHTML()).insert(closeLink).insert(hiddenValueField);
  },
  
  initialize: function(element, dataFetcher, values, options) {
    this.options = options || { };
    var outputElement = $(element);
    this.name = outputElement.name;
    this.form = outputElement.up('form');
    this.dataFetcher = dataFetcher;
    this.active = false;
    this.acceptNewValues      = this.options.acceptNewValues || false;
    this.options.frequency    = this.options.frequency || 0.4;
    this.options.minChars     = this.options.minChars || 2;
    this.options.tabindex     = this.options.tabindex || outputElement.readAttribute('tabindex') || '';
    this.options.onShow       = this.options.onShow ||
      function(element, update) {
        if(!update.style.position || update.style.position=='absolute') {
          update.style.position = 'absolute';
          try {
            update.clonePosition(element, {setHeight: false, offsetTop: element.offsetHeight});
          } catch(e) {
          }
        }
        Effect.Appear(update,{duration: 0.15});
      };
    this.options.onHide = this.options.onHide ||
      function(element, update){ new Effect.Fade(update,{duration: 0.15}) };
    
    this.searchField = new Element('input', {type: 'text', autocomplete: 'off', tabindex: this.options.tabindex});
    this.searchFieldItem = new Element('li', {className: 'search_field_item'}).update(this.searchField);
    this.holder = new Element('ul', {className: 'multi_value_field', style: outputElement.readAttribute('style')}).update(this.searchFieldItem);
    outputElement.insert({before: this.holder});
    outputElement.remove();
    
    this.choicesHolderList = new Element('ul');
    this.choicesHolder = new Element('div', {className: 'autocomplete', style: 'position: absolute;'}).update(this.choicesHolderList);
    this.holder.insert({after: this.choicesHolder});
    this.choicesHolder.hide();
    
    Event.observe(this.holder, 'click', Form.Element.focus.curry(this.searchField));
    Event.observe(this.searchField, 'keydown', this.onSearchFieldKeyDown.bindAsEventListener(this));
    if (this.acceptNewValues) {
      Event.observe(this.searchField, 'keyup', this.onSearchFieldKeyUp.bindAsEventListener(this));
      Event.observe(this.searchField, 'blur', this.onSearchFieldBlur.bindAsEventListener(this));
    };
    
    Event.observe(this.searchField, 'focus', this.getUpdatedChoices.bindAsEventListener(this));
    Event.observe(this.searchField, 'focus', this.show.bindAsEventListener(this));
    Event.observe(this.searchField, 'blur', this.hide.bindAsEventListener(this));
    
    this.setEmptyValue();
    (values || []).each(function(value) {
      this.addEntry(this.getValue(value), this.getTitle(value));
    }, this);
  },
  
  show: function() {
    if (!this.choicesHolderList.empty()) {
      if(Element.getStyle(this.choicesHolder, 'display')=='none') {
        this.options.onShow(this.holder, this.choicesHolder);
      }
    };
  },

  hide: function() {
    this.stopIndicator();
    if(Element.getStyle(this.choicesHolder, 'display')!='none') {
      this.options.onHide(this.element, this.choicesHolder);
    }
    if(this.iefix) Element.hide(this.iefix);
  },
  
  onSearchFieldKeyDown: function(event) {
    if(this.active) {
      switch(event.keyCode) {
       case Event.KEY_TAB:
       case Event.KEY_RETURN:
         this.selectEntry();
         event.stop();
       case Event.KEY_ESC:
         this.hide();
         this.active = false;
         event.stop();
         return;
       case Event.KEY_LEFT:
       case Event.KEY_RIGHT:
         return;
       case Event.KEY_UP:
         this.markPrevious();
         this.render();
         event.stop();
         return;
       case Event.KEY_DOWN:
         this.markNext();
         this.render();
         event.stop();
         return;
      }
    } else if(event.keyCode==Event.KEY_TAB || event.keyCode==Event.KEY_RETURN ||
              (Prototype.Browser.WebKit > 0 && event.keyCode == 0)) {
      return;
    } else if (event.keyCode==Event.KEY_BACKSPACE) {
      if (event.element().getValue().blank()) {
        var tag = event.element().up('li.search_field_item').previous('li.choice');
        if (tag) {
          this.removeEntry(tag);
        }
      };
    }

    this.changed = true;
    this.hasFocus = true;

    if(this.observer) clearTimeout(this.observer);
      this.observer =
        setTimeout(this.onObserverEvent.bind(this), this.options.frequency*1000);
  },
  
  onSearchFieldKeyUp: function(event) {
    var newValue = '';
    if(event.keyCode == 188 || event.keyCode == 32) {
      var fieldValue = $F(event.element());
      var separatorIndex = 0;
      if (event.keyCode == 188) {
        separatorIndex = fieldValue.indexOf(',');
      } else if (event.keyCode == 32) {
        separatorIndex = fieldValue.indexOf(' ');
      };
      newValue = fieldValue.substr(0, separatorIndex).toLowerCase().strip();
    }

    if (!newValue.blank()) {
      this.addEntry(newValue, newValue);
      event.element().value = fieldValue.substring(separatorIndex + 1, fieldValue.length);
    };
  },
  
  onSearchFieldBlur: function(event) {
    this.addNewValueFromSearchField.bind(this).delay(0.1, event.element());
  },
  
  addNewValueFromSearchField: function(searchFieldElement) {
    var newValue = $F(searchFieldElement).strip();
    if (!newValue.blank()) {
      this.addEntry(newValue, newValue);
      searchFieldElement.value = '';
    };
  },

  onObserverEvent: function() {
    this.changed = false;
    this.tokenBounds = null;
    if(this.getToken().length>=this.options.minChars) {
      this.getUpdatedChoices();
    } else {
      this.active = false;
      this.hide();
    }
  },
  
  getToken: function() {
    return this.searchField.value;
  },

  markPrevious: function() {
    if(this.index > 0) this.index--;
      else this.index = this.entryCount-1;
  },

  markNext: function() {
    if(this.index < this.entryCount-1) this.index++;
      else this.index = 0;
  },

  getEntry: function(index) {
    return this.choicesHolderList.childNodes[index];
  },

  getCurrentEntry: function() {
    return this.getEntry(this.index);
  },
  
  selectEntry: function() {
    this.active = false;
    var element = this.getCurrentEntry();
    this.addEntry(element.choiceId, element.textContent || element.innerText);
    this.searchField.clear();
    this.searchField.focus();
  },
  
  addEntry: function(id, title) {
    title = title || id;
    if (!this.selectedEntries().include('' + id)) {
      this.searchFieldItem.insert({before: this.createSelectedElement(id, title)});
    };
    var emptyValueField = this.emptyValueElement();
    if (emptyValueField) {
      emptyValueField.remove();
    };
  },
  
  removeEntry: function(entryElement) {
    entryElement = Object.isElement(entryElement) ? entryElement : this.holder.down("li[choice_id=" + entryElement + "]");
    if (entryElement) {
      entryElement.remove();
      if (this.selectedEntries().length == 0) {
        this.setEmptyValue();
      };
    };
  },
  
  clear: function() {
    this.holder.select('li.choice').each(function(e) { this.removeEntry(e); }, this);
  },
  
  setEmptyValue: function() {
    if (!this.emptyValueElement()) {
      this.form.insert(new Element('input', {type: 'hidden', name: this.name, className: 'emptyValueField'}));
    };
  },
  
  emptyValueElement: function() {
    return this.form.down("input.emptyValueField[name='" + this.name + "']");
  },
  
  selectedEntries: function() {
    return this.form.select("input[type=hidden][name='" + this.name + "[]']").map(function(entry) {return entry.value});
  },

  startIndicator: function() {},
  stopIndicator: function() {},

  getUpdatedChoices: function() {
    this.startIndicator();
    var term = this.getToken();
    if (term.length > 0) {
      this.dataFetcher(term, this.updateChoices.curry(term).bind(this));
    } else {
      this.choicesHolderList.update();
    };
  },
  
  updateChoices: function(term, choices) {
    if(!this.changed && this.hasFocus) {
      this.entryCount = choices.length;
      
      this.choicesHolderList.innerHTML = '';
      choices.each(function(choice, choiceIndex) {
        this.choicesHolderList.insert(this.createChoiceElement(this.getValue(choice), this.getTitle(choice), choiceIndex, term));
      }.bind(this));
      
      for (var i = 0; i < this.entryCount; i++) {
        var entry = this.getEntry(i);
        entry.choiceIndex = i;
        this.addObservers(entry);
      }
      
      this.stopIndicator();
      this.index = 0;

      if(this.entryCount==1 && this.options.autoSelect) {
        this.selectEntry();
        this.hide();
      } else {
        this.render();
      }
    }
  },
  
  addObservers: function(element) {
    Event.observe(element, "mouseover", this.onHover.bindAsEventListener(this));
    Event.observe(element, "click", this.onClick.bindAsEventListener(this));
  },

  onHover: function(event) {
    var element = Event.findElement(event, 'LI');
    if(this.index != element.autocompleteIndex)
    {
        this.index = element.autocompleteIndex;
        this.render();
    }
    Event.stop(event);
  },

  onClick: function(event) {
    var element = Event.findElement(event, 'LI');
    this.index = element.autocompleteIndex;
    this.selectEntry();
    this.hide();
  },

  createChoiceElement: function(id, title, choiceIndex, searchTerm) {
    var node = new Element('li', { choice_id: id });
    node.innerHTML = ('' + title).escapeHTML();
    node.choiceId = id;
    node.autocompleteIndex = choiceIndex;
    return node;
  },
  
  render: function() {
    if(this.entryCount > 0) {
      for (var i = 0; i < this.entryCount; i++)
        this.index==i ?
          Element.addClassName(this.getEntry(i),"selected") :
          Element.removeClassName(this.getEntry(i),"selected");
      if(this.hasFocus) {
        this.show();
        this.active = true;
      }
    } else {
      this.active = false;
      this.hide();
    }
  },
  
  getTitle: function(obj) {
    return Object.isArray(obj) ? obj[0] : obj;
  },
  
  getValue: function(obj) {
    return Object.isArray(obj) ? obj[1] : obj;
  }
  
});
