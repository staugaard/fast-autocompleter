Autocompleter.MultiValue = Class.create({
  options: $H({}),
  element: null,
  dataFetcher: null,
  
  createSelectedElement: function(id, title) {
    var closeLink = Builder.node('a', {className: 'close', href: '#'}, '×');
    closeLink.observe('click', function(e) {
      var choiceElement = e.element().up('li');
      choiceElement.remove();
      e.stop();
    });
    var hiddenValueField = Builder.node('input', {type: 'hidden', name: this.name, value: id, style: 'display: none;'});
    return Builder.node('li', { className:'choice', choice_id: id }, [title, closeLink, hiddenValueField]);
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
        Effect.Appear(update,{duration: 0.15, to: 0.9});
      };
    this.options.onHide = this.options.onHide ||
      function(element, update){ new Effect.Fade(update,{duration: 0.15, from: 0.9}) };
    
    this.searchField = Builder.node('input');
    this.searchFieldItem = Builder.node('li', {className: 'search_field_item'}, [this.searchField]);
    this.holder = Builder.node('ul', {className: 'multi_value_field', style: 'width: ' + (outputElement.getWidth() - 12) + 'px'}, [this.searchFieldItem]);
    outputElement.insert({before: this.holder});
    outputElement.remove();
    this.choicesHolder = Builder.node('ul', {className: 'multi_value_field_choices', style: 'position: absolute;'});
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
    if(!this.iefix &&
      (Prototype.Browser.IE) &&
      (Element.getStyle(this.choicesHolder, 'position')=='absolute')) {
      new Insertion.After(this.choicesHolder,
       '<iframe id="' + this.choicesHolder.id + '_iefix" '+
       'style="display:none;position:absolute;filter:progid:DXImageTransform.Microsoft.Alpha(opacity=0);" ' +
       'src="javascript:false;" frameborder="0" scrolling="no"></iframe>');
      this.iefix = $(this.choicesHolder.id+'_iefix');
    }
    if(this.iefix) {
      setTimeout(this.fixIEOverlapping.bind(this), 50);
    }
  },

  fixIEOverlapping: function() {
    Position.clone(this.choicesHolder, this.iefix, {setTop:(!this.choicesHolder.style.height)});
    this.iefix.style.zIndex = 1;
    this.choicesHolder.style.zIndex = 2;
    Element.show(this.iefix);
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
         Event.stop(event);
       case Event.KEY_ESC:
         this.hide();
         this.active = false;
         Event.stop(event);
         return;
       case Event.KEY_LEFT:
       case Event.KEY_RIGHT:
         return;
       case Event.KEY_UP:
         this.markPrevious();
         this.render();
         Event.stop(event);
         return;
       case Event.KEY_DOWN:
         this.markNext();
         this.render();
         Event.stop(event);
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
    this.getEntry(this.index).scrollIntoView(true);
  },

  markNext: function() {
    if(this.index < this.entryCount-1) this.index++;
      else this.index = 0;
    this.getEntry(this.index).scrollIntoView(false);
  },

  getEntry: function(index) {
    return this.choicesHolder.childNodes[index];
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
      
      this.choicesHolder.innerHTML = '';
      choices.each(function(choice, choiceIndex) {
        this.choicesHolder.insert(this.createChoiceElement(choice.last(), choice.first(), choiceIndex, term));
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
    var node = Builder.node('li', { className:'choice', choice_id: id });
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
