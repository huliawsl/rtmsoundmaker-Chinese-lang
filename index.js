const ipcRenderer = window.ipcRenderer;
const remote = window.remote;
const fs = window.fs;
const JSONbig = window.JSONbig;

let isPlaying = false;
let isSyncButton = true;
let notch = 0;
let speed = 0;
let tickSpeed = 0;
let acc = 3.0;
let maxSpeed = 130;
let currentLayerIndex = 0;
let currentLayer = null;
let currentPointNotch = 0;//0:brake 1:off 2:power
let maxLayer = 1;
let isInit = false;
let layerList = [];
let soundList = [];
let soundNameList = [];
let clipBoard = null;
let canvasFontSize = "15px 指定なし";
let highlightPointData = null;
let canvasMode = 0;//0:自動 1:再生優先 2:編集優先
let isEditorClick = false;
let laglessBuffer = 0.25;
var setSoundIndex = 0;
let isPitchLimit = true;
let undoData = [];
let undoIndex = 0;
let highlightColor = "red";
let filePathList = [];

let soundsJson = {};
let Dmain = "sound_default";
let SoundMap = {};
let subName = "223";

//## Event ##
window.onload = () => {
    init();
}

window.onresize = () => {
    let canvas = document.getElementById("canvas");
    let parentElm = canvas.parentElement;
    let width = parentElm.clientWidth;
    let height = parentElm.clientHeight;
    canvas.width = width;
    canvas.height = height;
    render();
}

ipcRenderer.on("openFile", (e, layers) => {
    layerList = [];
    resetSoundList();
    soundNameList = [];
    layers.forEach((layerData, index) => {
        let layer = new Layer();
        if(layerData.soundName !== undefined){
            layer.setData(layerData.soundName, layerData.pitchData, layerData.volumeData);
            layerList.push(layer);
            soundNameList.push(layerData.soundName);
        }
        filePathList[index] = { name: "none", path: "none" };
    });
    currentLayer = layerList[currentLayerIndex];
    soundList.fill(null, 0, layers.length - 1);
    updateLayer();
    setUndoData();
});

ipcRenderer.on("inportSounds", (e, data) => {
    let funcAry = [];
    resetSoundList();
    layerList.forEach((layer) => {
        layer.soundName = layer.soundName + " Unloaded";
    });
    data.forEach((file, index) => {
        funcAry.push(readSoundFile);
    });
    funcAry.push(new Promise(() => {
        updateLayer();
    }));
    funcAry.reduce((p, c) => {
        return p.then(c);
    }, Promise.resolve([0, data]));
});

function readSoundFile(data) {
    return new Promise((resolve, reject) => {
        let index = data[0];
        let filePath = data[1][index].path;
        let fileName = data[1][index].name;
        let soundIndex = index;
        if (soundIndex < 0 || filePath === "none") {
            resolve([index + 1, data[1]]);
        }
        else {
            filePathList[soundIndex] = { name: fileName, path: filePath };
            fs.readFile(filePath, (err, file) => {
                let blob = new Blob([file]);
                let reader = new FileReader();
                reader.readAsArrayBuffer(blob);
                reader.onload = () => {
                    let result = reader.result;
                    let audioContext = new AudioContext();
                    audioContext.decodeAudioData(result, (buffer) => {
                        let source = audioContext.createBufferSource();
                        let gain = audioContext.createGain();
                        source.buffer = buffer;
                        source.loop = true;
                        source.connect(gain);
                        gain.connect(audioContext.destination);
                        soundList[soundIndex] = [audioContext, source, gain, false];
                        layerList[soundIndex].soundName = fileName.substr(0, fileName.lastIndexOf("."));
                        updateLayer();
                        resolve([index + 1, data[1]]);
                    });
                };
            });
        }
    });
}

function clickBtn(e) {
    var e = e || window.event;
    var elem = e.target || e.srcElement;
    var elemId = elem.id;
    if(elemId === "Save"){
        createSoundMap();
        createSoundJson().then(()=>{
            ipcRenderer.send("menue", elemId, layerList, soundsJson, SoundMap, Dmain, subName, filePathList);
        });
    }
    else{
        ipcRenderer.send("menue", elemId, layerList, soundsJson, SoundMap, Dmain, subName, filePathList);
    }
}

function init() {
    layerList.push(new Layer());
    currentLayer = layerList[0];
    updateLayer();

    document.getElementById("panels").addEventListener("dragover", (e) => {
        e.preventDefault();
    });

    document.getElementById("panels").addEventListener("drop", (e) => {
        e.preventDefault();
        setSound(e.dataTransfer.files);
    });

    document.getElementById("canvas").addEventListener("click", (e) => {
        if(!isPlaying) setPlaying(true);
        if(speed === 0) setNotch(2);
        let mouseX = e.clientX;
        let positionX = e.target.getBoundingClientRect().left;
        let x = mouseX - positionX;
        let width = e.target.clientWidth;
        let u = x / width;
        let startU2 = 0.1;
        let endU2 = 0.95;
        let rate = 1 / (endU2 - startU2);
        if(startU2 <= u && u <= endU2) speed = (u - startU2) * rate * maxSpeed;
    });
    
    document.getElementById("canvas").addEventListener("contextmenu", (e) => {
        if(isPlaying){
            if(notch === 2) setNotch(0);
            else setNotch(2);
        }
        else{
            setPlaying(true);
            if(speed === 0) setNotch(2);
        }
    });

    updateRender();
    updateTick();
    changeLPanelData();
    setUndoData();
}

//## Export settings ##
function setDmain(e){
    Dmain = e.value;
}

function setSubName(e){
    subName = e.value;
}

function createSoundMap(){
    SoundMap = {};
    layerList.forEach((layer)=>{
        SoundMap[layer.soundName] = `${subName}.${layer.soundName}`;
    });
}

function createSoundJson(){
    let file = document.getElementById("addSoundsJson").files[0];
    let loadJson = file ? file.path : null;
    let baseData = {};
    let addData = {};
    if(loadJson){
        return new Promise((resolve, reject) => {
            fs.readFile(loadJson, "utf-8", (err, data) => {
                baseData = JSONbig.parse(data);
                layerList.forEach((layer)=>{
                    let name = layer.soundName;
                    if(name){
                        addData[`${subName}.${name}`] = {
                            "category": "master",
                            "sounds": [
                                {
                                    "name": `${subName}/${name}`,
                                    "stream": false
                                }
                            ]
                        }
                    }
                });
                soundsJson = Object.assign(baseData, addData);
                resolve();
            });
        });
    }
    else{
        return new Promise((resolve, reject) => {
            layerList.forEach((layer)=>{
                let name = layer.soundName;
                if(name){
                    addData[`${subName}.${name}`] = {
                        "category": "master",
                        "sounds": [
                            {
                                "name": `${subName}/${name}`,
                                "stream": false
                            }
                        ]
                    }
                }
            });
            soundsJson = addData;
            resolve();
        });
    }
}

//## Undo ##
function setUndoData(f) {
    return;
    if (undoData[undoIndex]) {
        if (undoIndex === 15) undoData.shift();
        else if (undoIndex < 15) undoIndex++;
    }
    undoData[undoIndex] = [currentLayerIndex, layerList.slice(), soundList.slice()];
    if (!f) undoData.fill(undefined, undoIndex + 1, 15);
    document.getElementById("undoIndex").innerHTML = `[${undoIndex}/15]`;
}

function undo() {
    return;
    resetSoundList();
    setUndoData(true);
    undoIndex -= 1;
    if (undoIndex > 0) {
        undoIndex -= 1;
        if (undoData[undoIndex] !== undefined) {
            layerList = [];
            console.log("undoIndex:" + undoIndex);
            console.log("do undo");
            currentLayerIndex = undoData[undoIndex][0];
            layerList = undoData[undoIndex][1];
            soundList = undoData[undoIndex][2];
            currentLayer = layerList[currentLayerIndex];
            layerList.filter(Boolean);
            maxLayer = layerList.length;
            updateLayer();
        }
    }
    document.getElementById("undoIndex").innerHTML = `[${undoIndex}/15]`;
}

function redo() {
    return;
    resetSoundList();
    undoIndex += 1;
    if (undoData[undoIndex] !== undefined) {
        layerList = [];
        console.log("do redo");
        currentLayerIndex = undoData[undoIndex][0];
        layerList = undoData[undoIndex][1];
        soundList = undoData[undoIndex][2];
        currentLayer = layerList[currentLayerIndex];
        layerList.filter(Boolean);
        maxLayer = layerList.length;
        updateLayer();
    }
    else undoIndex -= 1;
    document.getElementById("undoIndex").innerHTML = `[${undoIndex}/15]`;
}

//## update ##
function updateRender() {
    render();
    setTimeout(updateRender, 1);
}

function updateTick() {
    playSounds();
    if (!isPlaying) {
        setTimeout(updateTick, 1000 / 20);
    }
    else {
        let brakeAccList = 0.0025;
        let powerAcc = acc / 1440;
        let runResistAcc = 0.0002;
        let currentAcc = 0;
        let tickNotch = notch - 1;

        if (tickNotch > 0) currentAcc = powerAcc;
        if (tickNotch < 0) currentAcc = -brakeAccList;
        if (tickNotch === 0) currentAcc = -runResistAcc;

        tickSpeed = speed / 72;
        tickSpeed += currentAcc;
        if (tickSpeed <= 0.0 && tickNotch <= 0) {
            tickSpeed = 0;
            currentAcc = 0;
        }
        if (tickSpeed > maxSpeed / 72 && tickNotch === 1) {
            tickSpeed = maxSpeed / 72;
            currentAcc = 0;
        }

        speed = tickSpeed * 72;

        document.getElementById("speedData").innerHTML = `速度: ${(Math.floor(speed * 100) / 100).toFixed(2)} km/h`;
        document.getElementById("accData").innerHTML = `加速度: ${(Math.floor(currentAcc * 1440 * 100) / 100).toFixed(2)} km/h/s`;

        setTimeout(updateTick, 1000 / 20);
    }
}

//## Sound ##
function resetSoundList() {
    soundList.forEach((data) => {
        data[1].stop();
    });
    soundList = [];
}

function playSounds() {
    soundList.forEach((source, index) => {
        if (source) {
            let [ctx, src, gainNode, isPlayingFlag] = source;
            if (!isPlayingFlag) {
                soundList[index][3] = true;
                gainNode.gain.value = 0;
                src.start(0);
            }
            else {
                let pit = layerList[index].getCurrentValue("pitchData");
                let vol = layerList[index].getCurrentValue("volumeData");
                if (isPitchLimit && pit <= 0.25) pit = 0.25;
                if (!isPlaying) vol = 0;
                src.playbackRate.value = pit * 2;
                gainNode.gain.value = vol;
            }
        }
    });
}

function setSound(input) {
    let file = input[0];
    if (!file) return;
    if(!file.name.includes(".ogg") && !file.name.includes(".wav")) return;
    currentLayer.soundName = file.name.substr(0, file.name.lastIndexOf("."));
    filePathList[currentLayerIndex] = { name: file.name, path: file.path };
    let reader = new FileReader();
    setSoundIndex = currentLayerIndex;
    reader.readAsArrayBuffer(file);
    reader.onload = (e) => {
        let result = reader.result;
        let audioContext = new AudioContext();
        audioContext.decodeAudioData(result, (buffer) => {
            let source = audioContext.createBufferSource();
            let gain = audioContext.createGain();
            source.buffer = buffer;
            source.loop = true;
            source.connect(gain);
            gain.connect(audioContext.destination);
            soundList[setSoundIndex] = [audioContext, source, gain, false];
        });
    };
    updateLayer();
    setUndoData();
}

//## Left panel ##
function setPitchLimit(elm) {
    isPitchLimit = elm.checked;
}

function changeCanvasMode() {
    canvasMode += 1;
    if (canvasMode > 2) canvasMode = 0;
    let r;
    switch (canvasMode) {
        case 0: r = "模式:自动选择"; break;
        case 1: r = "模式:同步播放"; break;
        case 2: r = "模式:编辑同步"; break;
    }
    document.getElementById("canvasMode").innerHTML = r;
}

function setPlaying(bool) {
    isPlaying = bool;
    if (isPlaying) {
        document.getElementById("Play").className = "menueButton nButton selected";
        document.getElementById("Stop").className = "menueButton nButton";
    }
    else {
        document.getElementById("Stop").className = "menueButton nButton selected";
        document.getElementById("Play").className = "menueButton nButton";
    }
}

function setSyncButton(bool) {
    if (bool === undefined) isSyncButton = !isSyncButton;
    else isSyncButton = bool;

    if (isSyncButton) {
        document.getElementById("SyncBtn").className = "menueButton nButton selected";
        if (isSyncButton && notch !== currentPointNotch) setSelector(notch);
    }
    else document.getElementById("SyncBtn").className = "menueButton nButton";
}

function setNotch(id) {
    isEditorClick = false;
    notch = id;
    let selBrake = document.getElementById("Brakr");
    let selOff = document.getElementById("Off");
    let selPower = document.getElementById("Power");
    let list = [selBrake, selOff, selPower];
    list.forEach((v, i) => {
        if (i === id) v.className = "menueButton nButton selected";
        else v.className = "menueButton nButton";
    });

    if (isSyncButton && id !== currentPointNotch) setSelector(id);
}

function changeLPanelData() {
    maxSpeed = Math.floor(document.getElementById("maxSpeed").value / 10) * 10;
    if (maxSpeed < 100) maxSpeed = 100;
    if (maxSpeed > 360) maxSpeed = 360;
    document.getElementById("maxSpeed").value = maxSpeed;
    acc = document.getElementById("acceleration").value;
}

//## Canvas ##
function render() {
    let canvas = document.getElementById("canvas");
    let ctx = canvas.getContext('2d');
    let parentElm = canvas.parentElement;
    let width = parentElm.clientWidth;
    let height = parentElm.clientHeight;
    canvas.width = width;
    canvas.height = height;
    let bgLineColor = "#333333";//RGB
    let pitchBorderColor = "#33333355";//RGBA
    let renderer = new RSMRenderer(ctx, width, height);

    let startV1p = 0.08;
    let endV1p = 0.6;
    let startV1v = 0.78;
    let endV1v = 0.92;
    let startU1 = 0.08;
    let endU1 = 0.97;

    let startV2 = 0.05;
    let endV2 = 0.95;
    let startU2 = 0.1;
    let endU2 = 0.95;

    let startV3 = startV1p + ((endV1p - startV1p) / 4) * 3;
    let endV3 = endV1p;

    let charV = 0.7;
    let charU = 0.05;

    //横の文字/線
    let pitChar = ["2.0", "1.5", "1.0", "0.5", "0.0"];
    for (var i = 0; i < pitChar.length; i++) {
        let y = startV1p + (endV1p - startV1p) * (i / (pitChar.length - 1));
        let line = renderer.createPath(startU1, y, endU1, y);
        renderer.setLine(line, bgLineColor);
    }
    let charPathPit = renderer.createPath(charU, startV1p, charU, endV1p);
    renderer.setCharacters(charPathPit, pitChar);

    let volChar = ["1.0", "0.0"];
    for (var i = 0; i < volChar.length; i++) {
        let y = startV1v + (endV1v - startV1v) * (i / (volChar.length - 1));
        let line = renderer.createPath(startU1, y, endU1, y);
        renderer.setLine(line, bgLineColor);
    }
    let charPathVol = renderer.createPath(charU, startV1v, charU, endV1v);
    renderer.setCharacters(charPathVol, volChar);

    //縦の文字/線
    let speedChar = [];
    for (var i = 0; i <= Math.floor(maxSpeed / 10); i++) {
        speedChar.push(i * 10);
        let split = Math.floor(maxSpeed / 10);
        let x = startU2 + (endU2 - startU2) * (i / split);
        let line = renderer.createPath(x, startV2, x, endV2);
        renderer.setLine(line, bgLineColor);
    }
    let charPath = renderer.createPath(startU2, charV, endU2, charV);
    renderer.setCharacters(charPath, speedChar);

    //Data
    let pitData = [];
    let volData = [];
    layerList.forEach((layer, i) => {
        pitData[i] = layer.pitchData;
        volData[i] = layer.volumeData;
    });
    let showNotch;//0:自動 1:再生優先 2:編集優先  currentPointNotch : notch;
    switch (canvasMode) {
        case 0: showNotch = isEditorClick ? currentPointNotch : notch; break;
        case 1: showNotch = notch; break;
        case 2: showNotch = currentPointNotch; break;
    }

    //pitchData
    let pitPRenderer = renderer.createChildRenderer(startU2, startV1p, endU2, endV1p);
    let pitPRenderer_top = renderer.createChildRenderer(startU2, startV1p, endU2, endV1p);
    // pitData[layerIndex][notchState][pointIndex]
    pitData.forEach((layer, i) => {
        let colorL = i === currentLayerIndex ? highlightColor : getRandomRGB(i);
        let points = layer[showNotch].slice().filter(Boolean);
        points.forEach((point, j, ary) => {
            let u = point.speed / maxSpeed;
            let v = 1 - point.value;
            let isHighlight = point === highlightPointData;
            let colorP = isHighlight ? highlightColor : i === currentLayerIndex ? "white" : getRandomRGB(i);
            if (i === currentLayerIndex) pitPRenderer_top.setPoint(u, v, colorP, isHighlight);
            else pitPRenderer.setPoint(u, v, colorP, isHighlight);
            if (j < ary.length - 1) {
                let nextPoint = ary[j + 1];
                let u2 = nextPoint.speed / maxSpeed;
                let v2 = 1 - nextPoint.value;
                let line = pitPRenderer.createPath(u, v, u2, v2);
                if (i === currentLayerIndex) pitPRenderer_top.setLine(line, colorL);
                else pitPRenderer.setLine(line, colorL);
            }
        });
    });

    //volumeData
    let volPRenderer = renderer.createChildRenderer(startU2, startV1v, endU2, endV1v);
    let volPRenderer_top = renderer.createChildRenderer(startU2, startV1v, endU2, endV1v);
    // volData[layerIndex][notchState][pointIndex]
    volData.forEach((layer, i) => {
        let colorL = i === currentLayerIndex ? highlightColor : getRandomRGB(i);
        let points = layer[showNotch].slice().filter(Boolean);
        points.forEach((point, j, ary) => {
            let u = point.speed / maxSpeed;
            let v = 1 - point.value;
            let isHighlight = point === highlightPointData;
            let colorP = isHighlight ? highlightColor : i === currentLayerIndex ? "white" : getRandomRGB(i);
            if (i === currentLayerIndex) volPRenderer_top.setPoint(u, v, colorP, isHighlight);
            else volPRenderer.setPoint(u, v, colorP, isHighlight);
            if (j < ary.length - 1) {
                let nextPoint = ary[j + 1];
                let u2 = nextPoint.speed / maxSpeed;
                let v2 = 1 - nextPoint.value;
                let line = volPRenderer.createPath(u, v, u2, v2);
                if (i === currentLayerIndex) volPRenderer_top.setLine(line, colorL);
                else volPRenderer.setLine(line, colorL);
            }
        });
    });

    //再生バー
    let speedU = startU2 + (endU2 - startU2) * (speed / maxSpeed);
    let speedLine = renderer.createPath(speedU, startV2, speedU, endV2);
    renderer.setLine(speedLine, "yellow");

    //ピッチリミット
    if (isPitchLimit) {
        let rectPath = renderer.createPath(startU1, startV3, endU1, endV3);
        renderer.setRect(rectPath, pitchBorderColor);
    }

    //描画
    renderer.renderAll();
    pitPRenderer.renderAll();
    volPRenderer.renderAll();
    pitPRenderer_top.renderAll();
    volPRenderer_top.renderAll();
}

class RSMRenderer {
    constructor(ctx, w, h) {
        this.ctx = ctx;
        this.w = w;
        this.h = h;
        this.list = [];
        this.offsetX = 0;
        this.offsetY = 0;
        this.ctx.font = canvasFontSize;
        this.ctx.textAlign = "center";
        this.defaultColor = "white";
    }

    setOffset(x, y) {
        this.offsetX = x;
        this.offsetY = y;
    }

    createChildRenderer(u1, v1, u2, v2) {
        let lw = (u2 - u1) * this.w;
        let lh = (v2 - v1) * this.h;
        let r = new RSMRenderer(this.ctx, lw, lh);
        r.setOffset(u1 * this.w, v1 * this.h);
        return r;
    }

    createPath(u1, v1, u2, v2) {
        u1 = u1 * this.w + this.offsetX;
        u2 = u2 * this.w + this.offsetX;
        v1 = v1 * this.h + this.offsetY;
        v2 = v2 * this.h + this.offsetY;
        return new vecLine(u1, v1, u2, v2);
    }

    setLine(path, color) {
        path.color = color;
        this.list.push(["line", path]);
    }

    setCharacters(path, characters) {
        let size = characters.length - 1;
        characters.forEach((char, i) => {
            let split = i / size;
            let x = path.u1 + path.lu * split;
            let y = path.v1 + path.lv * split;
            this.list.push(["char", [char, x, y]]);
        });
    }

    setRect(path, color) {
        path.color = color;
        this.list.push(["rect", path]);
    }

    setPoint(u, v, color, isHighlight = false) {
        u = u * this.w + this.offsetX;
        v = v * this.h + this.offsetY;
        let box = isHighlight ? 3 : 2;
        let vec = new vecLine(u - box, v - box, u + box, v + box);
        vec.color = color || "white";
        this.list.push(["rect", vec]);
    }

    renderAll() {
        this.list.sort((a, b)=>{
            if(a[0] === "line" && b[0] !== "line") return -1;
            if(a[0] === "rect" && b[0] === "line") return 1;
            if(a[0] === "rect" && b[0] === "char") return -1;
            if(a[0] === "char" && b[0] !== "char") return 1;
            return 0;
        });
        this.list.forEach((parts) => {
            let type = parts[0];
            let path = parts[1];

            if (type === "line") {
                this.ctx.beginPath();
                this.ctx.strokeStyle = path.color;
                this.ctx.moveTo(path.u1, path.v1);
                this.ctx.lineTo(path.u2, path.v2);
                this.ctx.stroke();
            }

            if (type === "char") {
                this.ctx.fillStyle = this.defaultColor;
                path[2] += 5;
                this.ctx.fillText(...path);
            }

            if (type === "rect") {
                this.ctx.beginPath();
                this.ctx.strokeStyle = path.color;
                this.ctx.fillStyle = path.color;
                this.ctx.rect(path.u1, path.v1, path.lu, path.lv);
                this.ctx.fill()
                this.ctx.stroke();
            }
        });
    }
}

class vecLine {
    constructor(u1, v1, u2, v2) {
        this.u1 = u1;
        this.u2 = u2;
        this.v1 = v1;
        this.v2 = v2;
        this.lu = u2 - u1;
        this.lv = v2 - v1;
        this.color = "white";
    }
}

//## Calculation ##
function calc2p() {
    let x1 = document.getElementById("calcFuncSpd1").value;
    let y1 = document.getElementById("calcFuncVal1").value;
    let x2 = document.getElementById("calcFuncSpd2").value;
    let y2 = document.getElementById("calcFuncVal2").value;

    let a = Math.floor(((y2 - y1) / (x2 - x1)) * 10000) / 10000;
    let b = Math.floor(((x2 * y1 - x1 * y2) / (x2 - x1)) * 10000) / 10000;
    let r = `${a}*x+${b}`;

    document.getElementById("addPanelFunc").value = r;
}

function random2(seed) {
    var minDigits = 9;//最小桁数 最大11まで
    if (seed === 0) seed = 12345;
    seed = seed ^ seed << 13;
    seed = seed ^ seed >> 17;
    seed = seed ^ seed << 15;
    if (String(seed).length < minDigits) seed = random2(seed);
    return seed;
}

function getRandomRGB(id) {
    let rand = String(random2(id));
    let r = (rand.substr(0, 3) % 100) + 100;
    let g = (rand.substr(3, 3) % 100) + 100;
    let b = (rand.substr(6, 3) % 100) + 100;
    let rgb = `rgb(${r},${b},${g})`;
    let rgbTo16 = (col) => {
        return "#" + col.match(/\d+/g).map(function (a) { return ("0" + parseInt(a).toString(16)).slice(-2) }).join("");
    }
    return rgbTo16(rgb);
}

//## Point ##
class Point {
    constructor(spd, val, func) {
        this.speed = spd;
        this.value = val;
        this.func = func;
        if (this.value > 1.0) this.value = 1.0;
        if (this.value < 0.0) this.value = 0.0;
    }
}

function updatePointPanel() {
    let pitData = currentLayer.pitchData[currentPointNotch];
    let volData = currentLayer.volumeData[currentPointNotch];
    document.getElementById("pitchData").innerHTML = "";
    pitData.forEach((point, index) => {
        if (point) {
            let tmp1 =
                `<div style="float: left;" class="point" onmouseover="highlightPoint('pitchData',${index})" onmouseout="highlightPoint(null)">
                    <div >Speed:${point.speed}</div>
                    <div>Value:${point.value * 2}</div>
                    <div >f:${point.func}</div>
                    <div style="float: left;" onclick="editPoint(this)">[复制]</div>
                    <div style="float: right;" onclick="deletePoint('pitchData',${index})">[删除]</div>
                </div>`;
            document.getElementById("pitchData").insertAdjacentHTML("beforeend", tmp1);
        }
    });

    document.getElementById("volumeData").innerHTML = "";
    volData.forEach((point, index) => {
        if (point) {
            let tmp2 =
                `<div style="float: left;" class="point" onmouseover="highlightPoint('volumeData',${index})" onmouseout="highlightPoint(null)">
                    <div >Speed:${point.speed}</div>
                    <div>Value:${point.value}</div>
                    <div >f:${point.func}</div>
                    <div style="float: left;" onclick="editPoint(this)">[复制]</div>
                    <div style="float: right;" onclick="deletePoint('volumeData',${index})">[删除]</div>
                </div>`;
            document.getElementById("volumeData").insertAdjacentHTML("beforeend", tmp2);
        }
    });
}

function highlightPoint(type, index) {
    if (!type) highlightPointData = null;
    else highlightPointData = currentLayer[type][currentPointNotch][index];
}

function deletePoint(type, index) {
    delete currentLayer[type][currentPointNotch][index];
    updatePointPanel();
    setUndoData();
}

function addPitchPoint() {
    let x = Number(document.getElementById("addPanelSpd").value);
    if (x < 0) x = 0;
    if (x > maxSpeed) x = maxSpeed;
    x = Math.floor(x * 10) / 10;
    let func = document.getElementById("addPanelFunc").value;
    let v = Function(`"use strict"; return (${func.replace(/x/g, x)})`)();
    v = Math.floor(v * 100) / 100;
    currentLayer.addPitPoint(x, v, func);
    updatePointPanel();
    setUndoData();
}

function addVolumePoint() {
    let x = Number(document.getElementById("addPanelSpd").value);
    if (x < 0) x = 0;
    if (x > maxSpeed) x = maxSpeed;
    x = Math.floor(x * 10) / 10;
    let func = document.getElementById("addPanelFunc").value;
    let v = Function(`"use strict"; return (${func.replace(/x/g, x)})`)();
    v = Math.floor(v * 100) / 100;
    currentLayer.addVolPoint(x, v, func);
    updatePointPanel();
    setUndoData();
}

function editPoint(e) {
    let nodes = e.parentNode.children;
    let speed = nodes[0].innerText.replace("Speed:", "");
    let func = nodes[2].innerText.replace("f(x):", "");
    document.getElementById("addPanelSpd").value = speed;
    document.getElementById("addPanelFunc").value = func;
    updatePointPanel();
}

function copyData() {
    let pitchData = JSON.stringify(currentLayer.pitchData[currentPointNotch]);
    let volumeData = JSON.stringify(currentLayer.volumeData[currentPointNotch]);
    clipBoard = [pitchData, volumeData];
}

function pasteData() {
    if (!clipBoard) return;
    currentLayer.pitchData[currentPointNotch] = JSON.parse(clipBoard[0]);
    currentLayer.volumeData[currentPointNotch] = JSON.parse(clipBoard[1]);
    updatePointPanel();
    setUndoData();
}

//## Layer ##
function updateLayer() {
    maxLayer = layerList.length;
    document.getElementById("layerName").innerHTML = "层级" + (currentLayerIndex + 1) + "/" + maxLayer;
    document.getElementById("layerName").style.color = getRandomRGB(currentLayerIndex);
    document.getElementById("soundName").innerHTML = "音声:" + currentLayer.soundName;
    updatePointPanel();
}

function setSelector(type) {
    isEditorClick = true;
    currentPointNotch = type;
    let selBrake = document.getElementById("selectorBrakr");
    let selOff = document.getElementById("selectorOff");
    let selPower = document.getElementById("selectorPower");
    let list = [selBrake, selOff, selPower];
    list.forEach((v, i) => {
        if (i === type) v.className = "menueButton selector selected";
        else v.className = "menueButton selector";
    });
    updatePointPanel();

    if (isSyncButton && notch !== currentPointNotch) setNotch(type);
}

function addLayer() {
    layerList.push(new Layer());
    currentLayerIndex = layerList.length - 1;
    currentLayer = layerList[currentLayerIndex];
    maxLayer = layerList.length;
    updateLayer();
    document.getElementById("soundFile").value = "";
    setUndoData();
    filePathList[currentLayerIndex] = { name: "none", path: "none" };
}

function removeLayer() {
    soundList.splice(currentLayerIndex, 1);
    layerList.splice(currentLayerIndex, 1);
    if (currentLayerIndex !== 0) {
        currentLayerIndex--;
    }
    if (layerList.length === 0) {
        layerList.push(new Layer());
        currentLayerIndex = 0;
    }
    currentLayer = layerList[currentLayerIndex];
    maxLayer = layerList.length;
    updateLayer();
    document.getElementById("soundFile").value = "";
    setUndoData();
}

function nextLayer() {
    if (currentLayerIndex !== layerList.length - 1) {
        currentLayerIndex++;
        currentLayer = layerList[currentLayerIndex];
        updateLayer();
        document.getElementById("soundFile").value = "";
    }
}

function prevLayer() {
    if (currentLayerIndex !== 0) {
        currentLayerIndex--;
        currentLayer = layerList[currentLayerIndex];
        updateLayer();
        document.getElementById("soundFile").value = "";
    }
}

//popintData[layerIndex][notchState][pointIndex]
class Layer {
    constructor() {
        this.soundName = null;
        this.pitchData = [];
        this.volumeData = [];
        const loop = Array(3).fill();
        loop.forEach((_, i) => {
            this.pitchData[i] = [];
            this.volumeData[i] = [];
        });
    }

    setData(soundName, pitchData, volumeData) {
        this.soundName = soundName;
        this.pitchData = pitchData;
        this.volumeData = volumeData;
    }

    getCurrentValue(type) {//pitchData or volumeData
        let currentPoint = null;
        let nextPoint = null;
        let points = this[type][notch];
        let value = 0;
        for (let i = 0; i < points.length; i++) {
            currentPoint = points[i];
            if (!currentPoint) continue;
            if (i < points.length) nextPoint = points[i + 1];
            if (!nextPoint) {
                value = currentPoint.value;
                break;
            }
            if (currentPoint.speed <= speed && speed <= nextPoint.speed) {
                let x1 = currentPoint.speed;
                let y1 = currentPoint.value;
                let x2 = nextPoint.speed;
                let y2 = nextPoint.value;
                let a = ((y2 - y1) / (x2 - x1));
                let b = ((x2 * y1 - x1 * y2) / (x2 - x1));
                let r = a * speed + b;
                if (r > 1.0) r = 1.0;
                if (r < 0.0) r = 0.0;
                value = r;
                break;
            }
        }
        return value;
    }

    addPitPoint(spd, val, func) {
        let list = this.pitchData[currentPointNotch].filter(Boolean);
        let index = 0;
        let isOverwrite = 0;
        for (var i = 0; i < list.length; i++) {
            let p = list[i];
            if (p.speed >= spd) {
                index = i;
                if (p.speed === spd) isOverwrite = 1;
                break;
            }
        }
        let point = new Point(spd, val / 2, func);
        this.pitchData[currentPointNotch].splice(index, isOverwrite, point);
        this.pitchData[currentPointNotch].filter(Boolean);
        this.pitchData[currentPointNotch].sort(compare);
    }

    addVolPoint(spd, val, func) {
        let list = this.volumeData[currentPointNotch].filter(Boolean);
        let index = 0;
        let isOverwrite = 0;
        for (var i = 0; i < list.length; i++) {
            let p = list[i];
            if (p.speed >= spd) {
                index = i;
                if (p.speed === spd) isOverwrite = 1;
                break;
            }
        }
        let point = new Point(spd, val, func);
        this.volumeData[currentPointNotch].splice(index, isOverwrite, point);
        this.volumeData[currentPointNotch].filter(Boolean);
        this.volumeData[currentPointNotch].sort(compare);
    }
}

let compare = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;

    return (a.speed - b.speed)
}