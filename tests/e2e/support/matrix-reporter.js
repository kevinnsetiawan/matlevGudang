class MatrixReporter {
  constructor() { this.rows = []; }
  onTestEnd(test, result) {
    const project = test.parent.project()?.name || "unknown";
    const surface = test.title.replace(" obeys the mobile semantic contract", "");
    const message = (result.error?.message || "").toLowerCase();
    const failures = [];
    if (message.includes("timeout")) failures.push("timeout/navigation");
    if (message.includes('"documentoverflow":') && !message.includes('"documentoverflow": 0')) failures.push("document-overflow");
    if (message.includes('"touchtargets": [\n    {')) failures.push("touch-target");
    if (message.includes('"smalltext": [\n    {')) failures.push("font-size");
    if (message.includes('"formcontrols": [\n    {')) failures.push("form-control");
    if (message.includes('"unsafetables": [\n    {')) failures.push("table-containment");
    if (result.status !== "passed" && failures.length === 0) failures.push("route/assertion");
    this.rows.push({ project, surface, status:result.status, failures });
  }
  onEnd() {
    const passed = this.rows.filter(row => row.status === "passed").length;
    const failed = this.rows.length - passed;
    console.log(`MATRIX_SUMMARY total=${this.rows.length} passed=${passed} failed=${failed}`);
    for (const row of this.rows.filter(row => row.status !== "passed").sort((a,b) => `${a.project}/${a.surface}`.localeCompare(`${b.project}/${b.surface}`))) {
      console.log(`MATRIX_FAIL ${row.project} | ${row.surface} | ${row.failures.join(",")}`);
    }
  }
}

module.exports = MatrixReporter;
