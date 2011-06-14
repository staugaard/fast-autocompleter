(function($){
  $.fn.extend({
    debouncedKeypress: function(options) {
      var self = this;
      var timer;
      var frequency = ((options || {}).frequency || 0.4) * 1000;

      this.bind('debouncedKeypress', options.callback)

      var delayedHandler = function() {
        self.trigger('debouncedKeypress', { value: self.val() });
      };
      this.keydown(function() {
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(delayedHandler, frequency);
      });
      return this;
    },

    fastAutocomplete: function(options) {
      var self     = this;
      var lookup   = options.lookup;
      options.choices = options.choices || 10;
      delete options.select;
      delete options.lookup;

      var render = function(suggestions, options) {
        options.render(suggestions.slice(0, options.choices));
      }

      this.debouncedKeypress($.extend({
        callback: function(e, args) {
          var value = $.trim(args.value);
          if (value !== '') {
            lookup(value, render);
          } else {
            options.render([]);
          }
        }
      }, options));

      return this;
    }
  });
})(jQuery);
