const fs = require('fs');
const path = require('path');
const streamCombiner = require('stream-combiner');
const nunjucksOrig = require('nunjucks');
const through = require('through2');
const yaml = require('js-yaml');
const btoa = require('btoa');

const marked = require('marked');
const moment = require('moment');

const gulpData = require('gulp-data');
const gulpFrontMatter = require('gulp-front-matter');
const gulpIf = require('gulp-if');
const gulpNunjucks = require('gulp-nunjucks');
const gulpTap = require('gulp-tap');
const gulpUtil = require('gulp-util');

const PLUGIN_NAME = 'gulp-nucleus';

module.exports = function gulpNucleus(options = {}) {
  let { nunjucks, setupNunjucks, templateRootPath, dataPath, languagesDataPath } = options;
  let globalData = {};
  let currentLang = '';

  if (!nunjucks) nunjucks = nunjucksOrig;
  let nunjucksEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader(templateRootPath), setupNunjucks);

  // Custom filters
  nunjucksEnv.addFilter('markdown', function(str) {
    const html = marked(str)
    return html;
  })
  nunjucksEnv.addFilter('btoa', function(str) {
    return btoa(str);
  })
  nunjucksEnv.addFilter('printDate', function(date, inputDateFormat, outputDateFormat) {
    return moment(date, inputDateFormat).format(outputDateFormat);
  })

  // Data files
  function getDataFiles() {
    if (dataPath && fs.existsSync(dataPath)) {
      fs.readdirSync(dataPath).forEach(filename => {
        let path = `${dataPath}/${filename}`;
        let stat = fs.statSync(path);
        if (stat.isFile() && /.yaml$/.test(filename)) {
          let obj = yaml.safeLoad(fs.readFileSync(path, 'utf8'));
          globalData[filename.replace(/\..*/, '')] = obj;
        }
      });
    }
  }

  return streamCombiner(
      // extract frontmatter
      gulpFrontMatter({
        property: 'frontMatter',
        remove: true
      }),
      // start populating context data for the file, globalData, followed by file's frontmatter
      gulpTap((file, t) => {
        currentLang = 'en'
        if(languagesDataPath){
          for (var language in languagesDataPath) {
            if (file.relative.startsWith(language + '/') || file.relative.startsWith(language + '\\')) {
              currentLang = language
              dataPath = languagesDataPath[language];
            }
          }
          if (currentLang == 'en') dataPath = languagesDataPath[currentLang]
        }
        getDataFiles();
        return file.contextData = Object.assign({}, {currentLang: currentLang}, globalData, file.frontMatter)
      }),
      // handle generator files (e.g. $foo.html)
      gulpIf('**/$*.html', through.obj(function(file, enc, cb) {
        // pull out generator info and find the collection
        let gen = file.frontMatter.generate;
        let collection;
        
        gen.collection.split('.').map((element, index) => {
          if (index == 0) collection = globalData[element]
          else collection = collection[element]
        })

        if (!collection) {
          this.emit('error', new gulpUtil.PluginError(PLUGIN_NAME, `Collection ${gen.collection} not found.`));
          return cb();
        }
        // create a new file for each item in the collection
        collection.forEach(item => {
          let newFile = file.clone();
          newFile.contextData = Object.assign({}, file.contextData);
          newFile.contextData[gen.variable] = item;
          if (gen.frontMatter) {
            // generated front matter
            for (let k in gen.frontMatter) {
              newFile.contextData[k] = nunjucks.renderString(gen.frontMatter[k], newFile.contextData);
            }
          }
          let langPrefix = '';
          if (currentLang != 'en') langPrefix = currentLang;
          newFile.path = path.join(newFile.base,
              nunjucks.renderString(langPrefix + gen.filename, newFile.contextData));
          this.push(newFile);
        });
        cb();
      })),
      // run everything through swig templates
      gulpData(file => file.contextData),
      gulpNunjucks.compile({
        languages: languagesDataPath
      }, {
        env: nunjucksEnv,
      })
  );
};