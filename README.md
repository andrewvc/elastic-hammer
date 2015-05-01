# Elastic-Hammer
## Elastic-search Front-End

A web front-end for elasticsearch. Runs directly in the browser using localstorage. To use, install it as a plugin

`./plugin -install andrewvc/elastic-hammer`

### Features

* Auto-checks JSON as you type
* Compact, auto-sizing layout, for maximum information density
* Displays image URLs as actual images, URLs in search results as links
* Path based API detection enabling automatic smart settings during use
* Cross Platform
* Uses HTML5 localstorage to keep your request history

### Installing as an ElasticSearch plugin

Simply run (in your elasticsearch bin folder)

`./plugin -install andrewvc/elastic-hammer`

To use it visit `http://yourelasticsearchserver/_plugin/elastic-hammer/`

To upgrade the plugin run:

`./plugin -remove elastic-hammer; ./plugin -install andrewvc/elastic-hammer`

### Screenshot

![Screenshot](https://www.evernote.com/shard/s46/sh/691eda2f-ef89-4578-8a8a-eb73efd439c4/4efdcec6693f6bc84b47913bdf47d046/deep/0/Elastic-Hammer.png)

### In Development

* Improved output formatting
* Custom output formatters
* Automatic index detection
