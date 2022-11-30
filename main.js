const { app, dialog, ipcMain, BrowserWindow } = require("electron");
const fs = require("fs");
const JSONbig = require('json-bigint')({ "storeAsString": true });
const JSZip = require('jszip');
let win = null;
let importWin = null;
let isDevelop = false;
let isClosed = false;


//###   app   ###
app.on('ready', () => {
    createWindow();
    createInportWin();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !isClosed) {
        win = null;
        isClosed = true;
        app.quit();
    };
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


//###   ipc   ###
ipcMain.on("menue", (event, elemId, layerList, soundsJson, SoundMap, Dmain, subName, filePathList) => {
    switch (elemId) {
        case "New": reloadInfo(); break;
        case "Open": openFile(); break;
        case "Save": saveFile(layerList, soundsJson, SoundMap, Dmain, subName, filePathList); break;
        case "Close": app.quit(); break;
        case "Maximize": win.isMaximized() ? win.unmaximize() : win.maximize(); break;
        case "Minimize": win.minimize(); break;
        case "hide": setHide(); break;
    }
});

ipcMain.on("inportSounds", (event, soundData) => {
    win.webContents.send("inportSounds", soundData);
});


//###   func   ###
function createWindow() {
    const windowSize = [1366, 768];
    const minSize = [1000, 480];
    let winOpt = {
        width: windowSize[0],
        minWidth: minSize[0],
        height: windowSize[1],
        minHeight: minSize[1],
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            preload: `${__dirname}/preload.js`
        }
    };
    win = new BrowserWindow(winOpt);
    win.setMenu(null);
    win.loadFile("index.html");
    win.on('close', closeInfo);
    if (isDevelop) win.openDevTools();
}

function createInportWin() {
    if (!importWin) {
        let winOpt2 = {
            show: false,
            width: 500,
            minWidth: 500,
            height: 400,
            minHeight: 400,
            resizable: true,
            minimizable: false,
            maximizable: false,
            frame: false,
            webPreferences: {
                nodeIntegration: false,
                preload: `${__dirname}/preload.js`
            }
        };
        importWin = new BrowserWindow(winOpt2);
        importWin.setMenu(null);
        importWin.loadFile("inportSounds.html");
        importWin.on('close', (e) => {
            importWin = null;
        });
        if (isDevelop) importWin.openDevTools();
    }
}

function closeInfo(e) {
    const choice = dialog.showMessageBoxSync(win,
        {
            type: "info",
            buttons: ["取消", "退出"],
            title: "提示",
            message: "你有未保存的更改,确定要退出吗？"
        });
    if (choice === 0) {
        if (e) e.preventDefault();
    }
    else {
        if (!e) {
            win.destroy();
            if (importWin) importWin.destroy();
            app.quit();
        }
    }
}

function reloadInfo() {
    const choice = dialog.showMessageBoxSync(win,
        {
            type: "info",
            buttons: ["取消", "不保存继续"],
            title: "新建文件",
            message: "你有未保存的更改,确定要退出吗？"
        });
    if (choice !== 0) win.reload();
}

function openFile() {
    dialog.showOpenDialog(
        win,
        {
            properties: ['openFile'],
            filters: [
                {
                    name: 'SoundData',
                    extensions: ['json']
                }
            ]
        }
    ).then((result) => {
        if (result.canceled) return;
        let path = result.filePaths[0];
        fs.readFile(path, (e, data) => {
            let layers = JSONbig.parse(data.toString());
            win.webContents.send("openFile", layers);
            if (!importWin) createInportWin();
            importWin.webContents.send("openFile", layers);
            importWin.show();
            importWin.focus();
        });
    });
}

function setHide() {
    importWin.hide();
}

function saveFile(layerList, soundsJson, SoundMap, Dmain, subName, filePathList) {
    dialog.showSaveDialog(
        win,
        {
            filters: [
                { name: 'Sound data', extensions: ['json'] },
                { name: 'RTM sound files(js and zip)', extensions: ['js'] },
                { name: 'BVE motornoise files', extensions: ['zip'] }
            ]
        }
    ).then((result) => {
        if (result.canceled) return;
        let fileType = null;
        let path = result.filePath;
        let outpusJS = "";
        if (path.includes(".json")) fileType = "json";
        else if (path.includes(".js")) fileType = "js";
        else if (path.includes(".zip")) fileType = "cvs";
        if (fileType === "json") {
            writeFile(path, JSONbig.stringify(layerList));
        }

        if (fileType === "js") {
            let zip = new JSZip();
            let f_assets = zip.folder("assets");
            let f_scripts = f_assets.folder("minecraft").folder("scripts");
            let f_sounds = f_assets.folder(Dmain.toString()).folder("sounds");
            let f_sounds2 = f_sounds.folder(subName.toString());
            f_sounds.file("sounds.json", JSONbig.stringify(soundsJson, undefined, 4));

            let promiseList = [];
            let soundIndex = 0;
            let isWav = false;

            let loadTemplate = () => {
                return new Promise((resolve, reject) => {
                    data = templateJs;
                    data = data.replace("var Dmain = '';", `var Dmain = '${(Dmain).toString()}';`);
                    data = data.replace("var SoundMap = {};", `var SoundMap = ${JSONbig.stringify(SoundMap)};`);
                    data = data.replace("var SoundData = [];", `var SoundData = ${JSONbig.stringify(layerList)};`);
                    outpusJS = data;
                    f_scripts.file(path.substr(path.lastIndexOf("\\") + 1), data);
                    resolve();
                });
            };

            let loadSound = () => {
                return new Promise((resolve, reject) => {
                    if (!filePathList[soundIndex]) {
                        soundIndex++;
                        resolve();
                    }
                    else {
                        let loadpath = filePathList[soundIndex].path;
                        let loadname = filePathList[soundIndex].name;
                        soundIndex++;
                        fs.readFile(loadpath, (err, loadFile) => {
                            let buffer = Buffer.from(loadFile);
                            if (loadname.includes(".wav")) isWav = true;
                            f_sounds2.file(loadname, buffer, { binary: true });
                            resolve();
                        });
                    }
                });
            };

            promiseList.push(loadTemplate());
            filePathList.forEach(() => {
                promiseList.push(loadSound());
            });

            Promise.all(promiseList).then(() => {
                let savePlace = path.substr(0, path.lastIndexOf(".")) + ".zip";
                zip.generateNodeStream(
                    {
                        type: 'nodebuffer',
                        streamFiles: true,
                        compression: "DEFLATE",
                        compressionOptions: { level: 5 }
                    }
                )
                    .pipe(fs.createWriteStream(savePlace))
                    .on("finish", () => {
                        writeFile(path, outpusJS);
                        if (isWav) {
                            dialog.showMessageBox({
                                type: "warning",
                                title: "wav文件",
                                message: "wav文件不会自动转换\n请手动替换为ogg文件"
                            });
                        }
                        dialog.showMessageBox({
                            type: "info",
                            title: "导出完成",
                            message: "成功导出"
                        });
                    });
            });
        }

        if (fileType === "cvs") {
            let zip = new JSZip();
            let f_motornoise = zip.folder("motornoise");
            let f_sound = zip.folder("sound");

            let motornoiseData =
                "[Power]\nVolume = powervol.csv\nFrequency = powerfreq.csv\n\n[Brake]\nVolume = brakevol.csv\nFrequency = brakefreq.csv";
            let vehicleData =
                "BveTs Vehicle 1.00\nSound = sound\\Sound.txt\nMotorNoise = motornoise\\motornoise.txt";
            let brakefreqData = [];
            let brakevolData = [];
            let powerfreqData = [];
            let powervolData = [];
            let soundData = [];
            soundData.push(
                "Version 1.0\n\n[Run]\n\n[Motor]");
            layerList.forEach((layer, layerIndex) => {
                soundData.push(`${layerIndex} = ${layer.soundName}.wav`);
                let brakePitP = layer.pitchData[0];
                brakePitP.forEach((point) => {
                    if (point) {
                        let speed = point.speed * 10;
                        if(brakefreqData[speed] === undefined) brakefreqData[speed] = [];
                        brakefreqData[speed][layerIndex] = point.value * 2;
                    }
                });
                let brakeVolP = layer.volumeData[0];
                brakeVolP.forEach((point) => {
                    if (point) {
                        let speed = point.speed * 10;
                        if(brakevolData[speed] === undefined) brakevolData[speed] = [];
                        brakevolData[speed][layerIndex] = point.value;
                    }
                });
                let powerPitP = layer.pitchData[2];
                powerPitP.forEach((point) => {
                    if (point) {
                        let speed = point.speed * 10;
                        if(powerfreqData[speed] === undefined) powerfreqData[speed] = [];
                        powerfreqData[speed][layerIndex] = point.value * 2;
                    }
                });
                let powerVolP = layer.volumeData[2];
                powerVolP.forEach((point) => {
                    if (point) {
                        let speed = point.speed * 10;
                        if(powervolData[speed] === undefined) powervolData[speed] = [];
                        powervolData[speed][layerIndex] = point.value;
                    }
                });
            });
            zip.file("vehicle.txt", vehicleData);
            f_motornoise.file("brakefreq.csv", ary2csv(brakefreqData));
            f_motornoise.file("brakevol.csv", ary2csv(brakevolData));
            f_motornoise.file("motornoise.txt", motornoiseData);
            f_motornoise.file("powerfreq.csv", ary2csv(powerfreqData));
            f_motornoise.file("powervol.csv", ary2csv(powervolData));
            f_sound.file("Sound.txt", soundData.join("\n"));
            
            let promiseList = [];
            let soundIndex = 0;
            let isOgg = false;
            let loadSound = () => {
                return new Promise((resolve, reject) => {
                    if (!filePathList[soundIndex]) {
                        soundIndex++;
                        resolve();
                    }
                    else {
                        let loadpath = filePathList[soundIndex].path;
                        let loadname = filePathList[soundIndex].name;
                        soundIndex++;
                        fs.readFile(loadpath, (err, loadFile) => {
                            let buffer = Buffer.from(loadFile);
                            if (loadname.includes(".ogg")) isOgg = true;
                            f_sound.file(loadname, buffer, { binary: true });
                            resolve();
                        });
                    }
                });
            };

            filePathList.forEach(() => {
                promiseList.push(loadSound());
            });

            Promise.all(promiseList).then(() => {
                zip.generateNodeStream(
                    {
                        type: 'nodebuffer',
                        streamFiles: true,
                        compression: "DEFLATE",
                        compressionOptions: { level: 5 }
                    }
                )
                    .pipe(fs.createWriteStream(path))
                    .on("finish", () => {
                        if (isOgg) {
                            dialog.showMessageBox({
                                type: "warning",
                                title: "ogg文件",
                                message: "ogg文件不会自动转换\n请手动将其替换为 wav 文件"
                            });
                        }
                        dialog.showMessageBox({
                            type: "info",
                            title: "导出完成",
                            message: "成功导出"
                        });
                    });
            });
        }
    });
}

function writeFile(path, data) {
    fs.writeFile(path, data, (error) => {
        if (error != null) {
            console.log(error);
            return;
        }
    })
}

function ary2csv(ary) {//[layerIndex][speed]
    let ary2 = [];
    ary2.push("bvets motor noise table 0.01");
    for (let speed = 0; speed < ary.length; speed++) {
        if(ary[speed]) ary2.push(`${speed/10},${ary[speed].join(",")}`);
    }
    return ary2.join("\n");
}

templateJs = 
`importPackage(Packages.jp.ngt.ngtlib.util);
importPackage(Packages.jp.ngt.rtm.sound);
importPackage(Packages.jp.ngt.ngtlib.io);

function onUpdate(su) {
    updateSoundMaker(su);
}

/*
## RTM Sound Maker ##
Version 1.0

Copyright (c) 2021 hi03

This software is released under the MIT License.
http://opensource.org/licenses/mit-license.php
*/

//Input data
var Dmain = '';
var SoundMap = {};
var SoundData = [];
//Input data <END>

function updateSoundMaker(su) {
    var entity = su.getEntity();
    var dataMap = entity.getResourceState().getDataMap();
    var speed = su.getSpeed();
    var notch = su.getNotch();
    var notchIndex = 0;
    if (notch === 0) notchIndex = 1;
    if (notch > 0) notchIndex = 2;
    var prevNotchIndex = dataMap.getInt("prevNotchIndex");
    dataMap.setInt("prevNotchIndex", notchIndex, 0);
    var pitData = [];
    var volData = [];
    var soundNameList = [];
    SoundData.forEach(function (layer) {
        soundNameList.push(layer.soundName);
        pitData.push(layer.pitchData);
        volData.push(layer.volumeData);
    });
    soundNameList.forEach(function (name, layerIndex) {
        if (notchIndex !== prevNotchIndex) su.stopSound(Dmain, SoundMap[name]);
        var pitch = getValue(pitData[layerIndex], speed, notchIndex) * 2;
        var volume = getValue(volData[layerIndex], speed, notchIndex);
        su.playSound(Dmain, SoundMap[name], volume, pitch, true);
    });
}

function getValue(data, speed, notchIndex) {//pitchData or volumeData
    var points = data[notchIndex];
    var currentPoint = null;
    var nextPoint = null;
    var value = 0;
    for(var i = 0; i < points.length; i++){
        currentPoint = points[i];
        if (!currentPoint) continue;
        if (i < points.length) nextPoint = points[i + 1];
        if (!nextPoint) {
            value = currentPoint.value;
            break;
        }
        if (currentPoint.speed <= speed && speed <= nextPoint.speed) {
            var x1 = currentPoint.speed;
            var y1 = currentPoint.value;
            var x2 = nextPoint.speed;
            var y2 = nextPoint.value;
            var a = ((y2 - y1) / (x2 - x1));
            var b = ((x2 * y1 - x1 * y2) / (x2 - x1));
            var r = a * speed + b;
            if (r > 1.0) r = 1.0;
            if (r < 0.0) r = 0.0;
            value = r;
            break;
        }
    }
    return value;
}
//RTM Sound Maker <END>
`;