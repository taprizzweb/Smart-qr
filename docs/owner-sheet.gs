/**
 * Taprizz owner log: every play lands as a row in a Google Sheet. Free, no server.
 *
 * Setup (5 minutes):
 * 1. Create a Google Sheet (one per store, or one for all stores).
 * 2. Extensions > Apps Script. Paste this whole file, save.
 * 3. Deploy > New deployment > type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 * 4. Copy the Web app URL and paste it into the store's "sheetWebhook" (or the admin page field).
 *
 * Columns: Time, Store, Branch, Game, Name, Phone, Result, Coupon code, Valid until.
 * Note: the URL is public, so anyone who finds it could add junk rows. Keep it private to the store.
 */
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var d = JSON.parse(e.postData.contents);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Time", "Store", "Branch", "Game", "Name", "Phone", "Result", "Coupon code", "Valid until"]);
  }
  sheet.appendRow([
    new Date(d.time), d.store, d.branch, d.game,
    d.name, "'" + d.phone,           // leading quote keeps the number as text
    d.result, d.code, d.validUntil
  ]);
  return ContentService.createTextOutput("ok");
}
