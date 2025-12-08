module.exports = {
  default: {
    import: ['src/**/*.ts'],
    format: [
      'progress-bar',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json',
    ],
    formatOptions: {
      snippetsInterface: 'async-await',
    },
    // publishQuiet:true,
    paths: ['src/features/**/*.feature'],
  },
};
