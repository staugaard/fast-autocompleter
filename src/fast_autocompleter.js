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
    return '<li>' + choice.escapeHTML().gsub(new RegExp(this.getToken(), 'i'), '<strong>#{0}</strong>') + '</li>';
  }
});

Autocompleter.Cache = Class.create({
  initialize: function(backendLookup, options) {
    this.cache = new Hash();
    this.backendLookup = backendLookup;
    this.options = Object.extend({
      choices: 10,
      fuzzySearch: false
    }, options || {});
  },
  
  lookup: function(term, callback) {
    return this._lookupInCache(term, null, callback) || this.backendLookup(term, this._storeInCache.curry(term, callback).bind(this));
  },
  
  _lookupInCache: function(fullTerm, partialTerm, callback) {
    var partialTerm = partialTerm || fullTerm;
    var result = this.cache[partialTerm];
    
    if (result == null) {
      if (partialTerm.length > 1) {
        return this._lookupInCache(fullTerm, partialTerm.substr(0, partialTerm.length - 1), callback);
      } else {
        return false;
      };
    } else {
      if (fullTerm != partialTerm) {
        result = this._localSearch(result, fullTerm);
        this._storeInCache(fullTerm, null, result);
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
    this.cache[term] = data;
    if (callback) {
      callback(data.slice(0, this.options.choices));
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
      var choiceElement = e.element().up('li');
      choiceElement.remove();
      e.stop();
    });
    var hiddenValueField = new Element('input', {type: 'hidden', name: this.name, value: id, style: 'display: none;'});
    return new Element('li', { className:'choice', choice_id: id }).insert(title.escapeHTML()).insert(closeLink).insert(hiddenValueField);
  },
  
  initialize: function(element, dataFetcher, values, options) {
    this.options = options || { };
    var outputElement = $(element);
    this.name = outputElement.name;
    this.form = outputElement.up('form');
    this.dataFetcher = dataFetcher;
    this.active = false;
    this.options.frequency    = this.options.frequency || 0.4;
    this.options.minChars     = this.options.minChars || 2;
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
    
    this.searchField = new Element('input', {type: 'text', autocomplete: 'off'});
    this.searchFieldItem = new Element('li', {className: 'search_field_item'}).update(this.searchField);
    this.holder = new Element('ul', {className: 'multi_value_field', style: outputElement.getAttribute('style')}).update(this.searchFieldItem);
    outputElement.insert({before: this.holder});
    outputElement.remove();
    
    this.choicesHolderList = new Element('ul');
    this.choicesHolder = new Element('div', {className: 'autocomplete', style: 'position: absolute;'}).update(this.choicesHolderList);
    this.holder.insert({after: this.choicesHolder});
    this.choicesHolder.hide();
    
    Event.observe(this.holder, 'click', Form.Element.focus.curry(this.searchField));
    Event.observe(this.searchField, 'keydown', this.onKeyPress.bindAsEventListener(this));
    
    (values || []).each(function(value) {
      this.searchFieldItem.insert({before: this.createSelectedElement(value[1], value[0])});
    }, this);
  },
  
  show: function() {
    if(Element.getStyle(this.choicesHolder, 'display')=='none') {
      this.options.onShow(this.holder, this.choicesHolder);
    }
  },

  hide: function() {
    this.stopIndicator();
    if(Element.getStyle(this.choicesHolder, 'display')!='none') this.options.onHide(this.element, this.choicesHolder);
    if(this.iefix) Element.hide(this.iefix);
  },
  
  onKeyPress: function(event) {
    if(this.active)
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
     else
       if(event.keyCode==Event.KEY_TAB || event.keyCode==Event.KEY_RETURN ||
         (Prototype.Browser.WebKit > 0 && event.keyCode == 0)) return;

    this.changed = true;
    this.hasFocus = true;

    if(this.observer) clearTimeout(this.observer);
      this.observer =
        setTimeout(this.onObserverEvent.bind(this), this.options.frequency*1000);
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
    if (!this.selectedEntries().include('' + element.choiceId)) {
      this.searchFieldItem.insert({before: this.createSelectedElement(element.choiceId, element.textContent || element.innerText)});
    };
    this.searchField.clear();
    this.searchField.focus();
  },
  
  selectedEntries: function() {
    return this.form.select("input[name='" + this.name + "']").map(function(entry) {return entry.value});
  },

  startIndicator: function() {},
  stopIndicator: function() {},

  getUpdatedChoices: function() {
    this.startIndicator();
    var term = this.getToken();
    this.dataFetcher(term, this.updateChoices.curry(term).bind(this));
  },
  
  updateChoices: function(term, choices) {
    if(!this.changed && this.hasFocus) {
      this.entryCount = choices.length;
      
      this.choicesHolderList.innerHTML = '';
      choices.each(function(choice, choiceIndex) {
        this.choicesHolderList.insert(this.createChoiceElement(choice.last(), choice.first(), choiceIndex, term));
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
    node.innerHTML = title.escapeHTML().gsub(new RegExp(searchTerm, 'i'), '<strong>#{0}</strong>');
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
  }
  
});
