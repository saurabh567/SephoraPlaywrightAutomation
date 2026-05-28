const { setWorldConstructor } = require('@cucumber/cucumber');

class CustomWorld {
  constructor({ attach }) {
    this.attach = attach;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.pages = {};
    this.scenarioName = '';
  }
}

setWorldConstructor(CustomWorld);
