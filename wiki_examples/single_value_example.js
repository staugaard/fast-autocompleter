function lookup(searchString, callback) {
  new Ajax.Request('/users/autocomplete', { parameters: {name: searchString, rand: (new Date()).getTime()},
                                            onSuccess: function(response) {
                                              callback(response.responseJSON);
                                            } });
}

var cachedBackend = new Autocompleter.Cache(lookup, {choices: 10});
var cachedLookup = cachedBackend.lookup.bind(cachedBackend);

new Autocompleter.Json('autocomplete', 'autocomplete_choices', lookup, {frequency: 0.1});