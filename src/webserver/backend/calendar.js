module.exports = class Calendar {
  constructor() {
    this.years = {};
  }

  addDate(d) {
    const date = new Date(d);
    const day = date.getUTCDate();
    const month = date.getUTCMonth();
    const year = date.getUTCFullYear();
    if (!this.years[year]) this.years[year] = {};
    if (!this.years[year][month]) this.years[year][month] = {};
    if (!this.years[year][month][day]) this.years[year][month][day] = true;
  }
};
