const electron = require('electron');
const Datastore = require('nedb');
const url = require('url');
const path = require('path');
const menuBar = require('./src/components/MenuBar');

const { app, BrowserWindow, Menu, ipcMain } = electron;

let mainWindow;

//prevents more than one instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'assets/icons/win/icon.ico'),
    title: 'Britannia House Reception',
    webPreferences: { nodeIntegration: true },
  });
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, 'src/index.html'),
      protocol: 'File:',
      slashes: true,
    })
  );
  mainWindow.on('closed', () => app.quit());
  mainWindow.maximize();
  const mainMenu = Menu.buildFromTemplate(menuBar);

  Menu.setApplicationMenu(mainMenu);
});

const db = new Datastore({
  filename: './items.db',
  autoload: true,
});

// Get the items for today and yesterday from db, sort by id and send them to the client, id is UTC so sorted by date
//colleagues
ipcMain.on('loadListColleagues', (e, item) => {
  db.find({ type: item.type, $or: [{ date: item.today }, { date: item.yesterday }] })
    .sort({ id: 1 })
    .exec((err, docs) => mainWindow.webContents.send('loadedColleagues', docs));
});

//visitors
ipcMain.on('loadListVisitors', (e, item) => {
  db.find({ type: item.type, $or: [{ date: item.today }, { date: item.yesterday }] })
    .sort({ id: 1 })
    .exec((err, docs) => mainWindow.webContents.send('loadedVisitors', docs));
});

//Saves item in the db
ipcMain.on('addItem', (e, item) => {
  db.insert(item, (err) => {
    if (err) throw new Error(err);
  });
});

// Clears database and send event to client if successful
ipcMain.on('clearAll', () => {
  db.remove({}, { multi: true }, (err) => {
    if (err) throw new Error(err);
    mainWindow.webContents.send('cleared');
  });
});

//delete item from the db
ipcMain.on('deleteItem', (e, item) => {
  db.remove({ id: item.item.id }, {});
});

//DELETE Older than 6 months

ipcMain.on('deleteOld', (e, item) => {
  db.remove(
    {
      $where: function () {
        return this.date.includes(item.sixAgoFormattedMonth);
      },
    },
    { multi: true },
    function (err, numRemoved) {
      if (err) throw new Error(err);
      mainWindow.webContents.send('deletedOld', numRemoved);
    }
  );
});

//update returned
ipcMain.on('updateItemReturned', (e, item, noteContent) => {
  db.update(
    { id: item.item.id },
    {
      id: item.item.id,
      firstName: item.item.firstName,
      lastName: item.item.lastName,
      card: item.item.card,
      date: item.item.date,
      hour: item.item.hour,
      returned: 'Returned',
      note: item.noteContent,
      type: 'colleagues',
    },
    {}
  );
});

//update not returned
ipcMain.on('updateItemNotReturned', (e, item, noteContent) => {
  db.update(
    { id: item.item.id },
    {
      id: item.item.id,
      firstName: item.item.firstName,
      lastName: item.item.lastName,
      card: item.item.card,
      date: item.item.date,
      hour: item.item.hour,
      returned: 'Not Returned',
      note: item.noteContent,
      type: 'colleagues',
    },
    {}
  );
});

ipcMain.on('updateNote', (e, item, noteValue, returnedStatus) => {
  db.update(
    { id: item.item.id },
    {
      id: item.item.id,
      firstName: item.item.firstName,
      lastName: item.item.lastName,
      card: item.item.card,
      date: item.item.date,
      hour: item.item.hour,
      returned: item.returnedStatus,
      note: item.noteValue,
      type: 'colleagues',
    },
    {}
  );
});

//FIND
ipcMain.on('findItem', (e, item) => {
  //date only
  if (
    item.searchDate !== '//' &&
    item.month === '/' &&
    item.firstName === '' &&
    item.lastName === '' &&
    item.card === ''
  ) {
    db.find({ date: item.searchDate, type: item.type })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //last name no date
  } else if (
    item.searchDate === '//' &&
    item.month === '/' &&
    item.firstName === '' &&
    item.lastName !== '' &&
    item.card === ''
  ) {
    db.find({
      type: item.type,
      $where: function () {
        return this.lastName.includes(item.lastName);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //first name no date
  } else if (
    item.searchDate === '//' &&
    item.month === '/' &&
    item.firstName !== '' &&
    item.lastName === '' &&
    item.card === ''
  ) {
    db.find({
      type: item.type,
      $where: function () {
        return this.firstName.includes(item.firstName);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //last name with date
  } else if (
    item.searchDate !== '//' &&
    item.month === '/' &&
    item.firstName === '' &&
    item.lastName !== '' &&
    item.card === ''
  ) {
    db.find({
      date: item.searchDate,
      type: item.type,
      $where: function () {
        return this.lastName.includes(item.lastName);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //last name with month
  } else if (
    item.searchDate === '//' &&
    item.month !== '/' &&
    item.firstName === '' &&
    item.lastName !== '' &&
    item.card === ''
  ) {
    db.find({
      type: item.type,
      $where: function () {
        return this.lastName.includes(item.lastName) && this.date.includes(item.month);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //first name with date
  } else if (
    item.searchDate !== '//' &&
    item.month === '/' &&
    item.firstName !== '' &&
    item.lastName === '' &&
    item.card === ''
  ) {
    db.find({
      date: item.searchDate,
      type: item.type,
      $where: function () {
        return this.firstName.includes(item.firstName);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //first name with month
  } else if (
    item.searchDate === '//' &&
    item.month !== '/' &&
    item.firstName !== '' &&
    item.lastName === '' &&
    item.card === ''
  ) {
    db.find({
      type: item.type,
      $where: function () {
        return this.firstName.includes(item.firstName) && this.date.includes(item.month);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //both names no date
  } else if (
    item.searchDate === '//' &&
    item.month === '/' &&
    item.firstName !== '' &&
    item.lastName !== '' &&
    item.card === ''
  ) {
    db.find({
      type: item.type,
      $where: function () {
        return this.firstName.includes(item.firstName) && this.lastName.includes(item.lastName);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //both names with date
  } else if (
    item.searchDate !== '//' &&
    item.month === '/' &&
    item.firstName !== '' &&
    item.lastName !== '' &&
    item.card === ''
  ) {
    db.find({
      date: item.searchDate,
      type: item.type,
      $where: function () {
        return this.firstName.includes(item.firstName) && this.lastName.includes(item.lastName);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));
    //both names with month
  } else if (
    item.searchDate === '//' &&
    item.month !== '/' &&
    item.firstName !== '' &&
    item.lastName !== '' &&
    item.card === ''
  ) {
    db.find({
      type: item.type,
      $where: function () {
        return (
          this.firstName.includes(item.firstName) &&
          this.lastName.includes(item.lastName) &&
          this.date.includes(item.month)
        );
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));
    //card number only
  } else if (
    item.card !== '' &&
    item.type === 'colleagues' &&
    item.searchDate === '//' &&
    item.month === '/' &&
    item.firstName === '' &&
    item.lastName === ''
  ) {
    db.find({ card: item.card, type: item.type })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));

    //card number with date
  } else if (
    item.card !== '' &&
    item.type === 'colleagues' &&
    item.searchDate !== '//' &&
    item.month === '/' &&
    item.firstName === '' &&
    item.lastName === ''
  ) {
    db.find({ card: item.card, type: item.type, date: item.searchDate })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));
    //card number with month
  } else if (
    item.month !== '/' &&
    item.card !== '' &&
    item.type === 'colleagues' &&
    item.searchDate === '//' &&
    item.firstName === '' &&
    item.lastName === ''
  ) {
    db.find({
      card: item.card,
      type: item.type,
      $where: function () {
        return this.date.includes(item.month);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));
    //month only
  } else if (
    item.month !== '/' &&
    item.searchDate === '//' &&
    item.firstName === '' &&
    item.lastName === '' &&
    item.card === ''
  ) {
    db.find({
      type: item.type,
      $where: function () {
        return this.date.includes(item.month);
      },
    })
      .sort({ id: 1 })
      .exec((err, docs) => mainWindow.webContents.send('found', docs));
  }
});
