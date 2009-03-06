var res = null;

function lookup(searchString, callback) {
  new Ajax.Request('http://github.com/api/v1/json/search/' + searchString, {
                                            onSuccess: function(response) {
                                              res = response.responseJSON;
                                              //callback(response.responseJSON);
                                            } });
}

var cachedBackend = new Autocompleter.Cache(lookup, {choices: 10});
var cachedLookup = cachedBackend.lookup.bind(cachedBackend);

new Autocompleter.Json('autocomplete', 'autocomplete_choices', lookup, {frequency: 0.1});