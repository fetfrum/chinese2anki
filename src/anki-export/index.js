const Exporter = require('./exporter.js');
const createTemplate = require('./template.js');

let sql;

if (process.env.APP_ENV === 'browser' || typeof window !== 'undefined') {
  require('script-loader!sql.js');
  sql = window.SQL;
} else {
  sql = require('sql.js');
}

module.exports = {
  Exporter,
  default: function(deckName, template) {
    return new Exporter(deckName, {
      template: createTemplate(template),
      sql
    });
  }
};
