// STARGAZER V0.0.0.3
// A GRAPHICAL USER INTERFACE FOR TRASH COMPACTING ROBOTS
// USED TO CONTROL EXPRESSIVE SENSOR UNIT FROM AN INTERNET CONNECTED DEVICE
// VISUALIZES ENVIORNMENT SCANS FOR REFUSE DETTECTION AND COMPACTION

// JAMES DAVIS 2022


// for realtime communication with the ESP32, We use websockets

var gateway = `ws://${window.location.hostname}/ws`;
var websocket;

window.addEventListener('load', onLoad);

function onLoad(event) {
    initWebSocket();

    document.getElementById("b1").addEventListener('click', onToggle);
    document.getElementById("b2").addEventListener('click', onScan);
    document.getElementById("b3").addEventListener('click', onReset);
    document.getElementById("b4").addEventListener('click', toggleDebug);

    document.querySelectorAll(".slider").forEach(function(element) {
        element.addEventListener('mousedown', disableOrbit) 
    });
    document.querySelectorAll(".slider").forEach(function(element) {
        element.addEventListener('mouseup', enableOrbit) 
    });
}

function toggleDebug(){
    debug = !debug;
}

function disableOrbit() {
    orbit = false;
}

function enableOrbit() {
    orbit = true;
}
// Global Variables

let connected = false;  //tracks if the websocket connection is still valid
let scanning = false;   // tracks if WALL-E is in scanning mode
let scanloop;
let orbit = true;
let debug = true;
let puppet = true;

let data = 0;           // IR Sensor data
let lastData = 0;

let thetaMin = 60;      //Servo software Limits 
let thetaMax = 140;     
let phiMin = 0;
let phiMax = 65;

let panTheta = thetaMin; // theta defines pan angle
let tiltPhi = phiMin;    // phi defines tilt angle

let scanStepTime = 450   // time in between each motor rotation in a scan
let thetaInt = 1         // angle increment of servos
let phiInt = 1          

let displayScale = 3     // spreads out points

let points = []

// A class for point values, which takes in Spherical coordinates, 
// and automatically calulates Cartesian coordinates

class dataPoint {
    constructor(theta, phi, r, data) {
        this.theta = theta;
        this.phi = phi;
        this.r = r;
        this.data = data //stores raw sensor data

        // calculate cartesian coordiantes

        this.x = r * cos(phi) * sin(theta);
        this.y = r * sin(phi) * sin(theta);
        this.z = r * cos(theta);
    }

    adjustAngles(dtheta, dphi) {
        this.x = r * cos(phi*dphi) * sin(theta*dtheta);
        this.y = r * sin(phi*dphi) * sin(theta*dtheta);
        this.z = r * cos(theta*dtheta);
    }

}

// calibrates sensor data values into a real world distance
// input: Reading - sensor reading 
// output: distance in cm

function calibratePoint(reading) {
    let x = reading;
    if (x == 0){ // handle 0, as the math will give a value of infinity
        return 0
    } else{
        return 51267*pow(x,-0.976);
    }
}

//callback function for scan button
//initiates a

function onScan(event) {
    if(scanning == false){ //check if allready scanning
        scanning = true;
        if (connected){
            scanloop = setInterval(scanPoint,scanStepTime); //initiate a scan loop
        }else{
            setTimeout(onScan, 100); // handle disconnects
        }
    }else{
        scanning = false;
        clearInterval(scanloop);
    }
}

// callback for reset button

function onReset(event) {
    scanning = false;
    clearInterval(scanloop);

    panTheta = thetaMin;
    tiltPhi = phiMin;

    points = [];
}

// scanning logic
// moves motors by increment phiInt and thetaInt
// adds a point to the scan data.

function scanPoint(){
    console.log(data,lastData);
    if (connected && data != lastData){ //check to make sure data is updating
        if(panTheta < thetaMax){
            if(tiltPhi < phiMax){
                moveMotors(panTheta,tiltPhi);

                setTimeout(addPoint(panTheta,tiltPhi),10);

                tiltPhi += phiInt;
            } else {
                panTheta += thetaInt
                tiltPhi = phiMin;

                moveMotors(panTheta,tiltPhi);

                setTimeout(addPoint(panTheta,tiltPhi),10);

                tiltPhi += phiInt;
            }    
        }
    }
    lastData = data;
}

//takes motor angles and sensor reading and creates a point object

function addPoint(theta, phi){
    let r = calibratePoint(data);
    console.log(r," mm")
    points.push(new dataPoint(theta,phi,r,data));
}

// P5.JS Setup, for the 3d enviornment

function setup() {
    //s = windowHeight*0.6;

    setAttributes('antialias', true);
    setAttributes('alpha', true);
    var myCanvas = createCanvas(windowWidth,windowHeight,WEBGL);
    myCanvas.parent("p5canvas");

    angleMode(DEGREES);
}

// P5.JS Draw loop, for the 3d enviornment

function draw() {
    clear();
    debug ? debugMode():null;
    orbit ? orbitControl():null;
    

    displayScale = document.getElementById("s3").value/100;

    // Draw array of scanned points
    
    for (const p of points){
        push();
        fill("white")
        noStroke();
        translate(p.x*displayScale, p.y*displayScale, p.z*displayScale);
        sphere(random(.5*displayScale,1*displayScale),6,4)
        pop();
    }
}

// resizes canvas on when browser window is resized.

function windowResized() {
    //s = windowHeight*0.6
    resizeCanvas(windowWidth, windowHeight);
}

// allows pupetteering of WALL-E by following 
// mouse or touch position on screen when clicked
// maps screen space to max rotations

function mouseDragged() {
    if (scanning == false && connected){
        let pan = map(mouseX, 0, width, thetaMin, thetaMax);
        let tilt = map(mouseY, 0, height, phiMax, phiMin);
        setTimeout(moveMotors(pan,tilt), 10);
    }
}

function moveMotors(pan,tilt){
    websocket.send(JSON.stringify({'action':'pan','val':pan}));
    websocket.send(JSON.stringify({'action':'tilt','val':tilt}));
}

//callbacks for websocket handleing

function initWebSocket() {
    console.log('Trying to open a WebSocket connection...');
    websocket = new WebSocket(gateway);
    websocket.onopen    = onOpen;
    websocket.onclose   = onClose;
    websocket.onmessage = onMessage;
}

function onOpen(event) {
    connected = true;
    console.log('Connection opened');
}
 
function onClose(event) {
    connected = false
    console.log('Connection closed');
    setTimeout(initWebSocket, 100);
}
 
function onMessage(event) {
    data = event.data
    //console.log(data)
     //let data = JSON.parse(event.data);
}
 
function onToggle(event) {
    websocket.send(JSON.stringify({'action':'toggle','value':0}));
     
}