export default class Calendar {
  years: Record<number, Record<number, Record<number, boolean>>>;

  constructor() {
    this.years = {};
  }

  addDate(d: string | number | Date) {
    const date = new Date(d);
    const day = date.getUTCDate();
    const month = date.getUTCMonth();
    const year = date.getUTCFullYear();
    if (!this.years[year]) this.years[year] = {};
    if (!this.years[year][month]) this.years[year][month] = {};
    if (!this.years[year][month][day]) this.years[year][month][day] = true;
  }
}
