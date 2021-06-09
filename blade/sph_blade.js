"use strict";

// global variables ***************************************************
// canvas
let canvasWidth, canvasHeight;

// particle
let p, pWall, pBlade;
let particleSize, h;
let massParticle, stiffness, density0, viscosity;
let w;
let grv;

// region
let regionAll, regionInner, regionInitial;
let thicknessWall;
let cell;

// time
let time, timeDelta;

// control
let isRun;

// blade
let regionBlade;
let omegaBlade, angleBlade, centerBlade;

// class *********************************************************
class Vector {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  magnitude() {
    return Math.sqrt(this.dot(this));
  }

  sub(v) {
    const x = this.x - v.x;
    const y = this.y - v.y;
    return new Vector(x, y);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }
}

class Particle {
  constructor(x = 0, y = 0) {
    this.position = new Vector(x, y);
    this.velocity = new Vector();
    this.velocity2 = new Vector();
    this.force = new Vector();
    this.pressure = 0;
    this.density = 0;
    this.active = true;
  }

  remove() {
    this.active = false;
  }

  indexX(cell) {
    return Math.floor((this.position.x - cell.region.left) / cell.h);
  }

  indexY(cell) {
    return Math.floor((this.position.y - cell.region.bottom) / cell.h);
  }

  indexCell(cell) {
    return this.indexX(cell) + this.indexY(cell) * cell.nx;
  }

  forNeighbor(cell, func) {
    const indexX = this.indexX(cell);
    const indexY = this.indexY(cell);

    for (let i = indexX-1; i <= indexX+1; i++) {
      if (i < 0 || i >= cell.nx) continue;

      for (let j = indexY-1; j <= indexY+1; j++) {
        if (j < 0 || j >= cell.ny) continue;
        const indexCell = i + j * cell.nx;

        for (let k = 0, n = cell.bucket[indexCell].length; k < n; k++) {
          const pNeighbor = cell.bucket[indexCell][k];
          const rv = this.position.sub(pNeighbor.position);
          if (rv.magnitude() >= cell.h) continue;

          func(pNeighbor, rv);
        }
      }
    }
  }
}

class Cell {
  constructor(region, h) {
    this.h = h;
    this.nx = Math.ceil(region.width / this.h);
    this.ny = Math.ceil(region.height / this.h);
    this.bucket = new Array(this.nx * this.ny);
    this.region = region;
  }

  clear() {
    for (let i = 0, n = this.bucket.length; i < n; i++) {
      this.bucket[i] = [];
    }
  }

  add(p) {
    for (let i = 0, n = p.length; i < n; i++) {
      if (!p[i].active) continue;
      this.bucket[p[i].indexCell(this)].push(p[i]);
    }
  }
}

class Rectangle {
  constructor(x, y, width, height) {
    this.width = width;
    this.height = height;
    this.left = x;
    this.right = x + width;
    this.bottom = y;
    this.top = y + height;
  }
}

class Kernel {
  // Poly6 kernel
  constructor(h) {
    this.h = h;
    this.alpha = 4 / (Math.PI * Math.pow(h, 8));
  }

  kernel(r) {
    if (r < this.h) {
      return this.alpha * Math.pow(this.h * this.h - r * r, 3);
    } else {
      return 0;
    }
  }
  
  gradient(rv) {
    const r = rv.magnitude();
    if (r < this.h) {
      const c = -6 * this.alpha * Math.pow(this.h * this.h - r * r, 2);
      return new Vector(c * rv.x, c * rv.y);
    } else {
      return new Vector();
    }
  }
}

// functions ************************************************************
function setup() {
  setParameter();
  createCanvas(canvasWidth, canvasHeight);
  resetSPH();

  const buttonRun = createButton("再生 / 停止");
  buttonRun.position(10, canvasHeight + 20)
  buttonRun.mousePressed(runSPH);

  const buttonReset = createButton("リセット");
  buttonReset.position(100, canvasHeight + 20)
  buttonReset.mousePressed(resetSPH);
}

function draw() {
  if (isRun) {
    time += timeDelta;
  
    motionUpdate();
    drawParticle()
  }
}

function runSPH() {
  isRun = !isRun;
}

function resetSPH() {
  isRun = false;
  time = 0;
  initialParticle();
  drawParticle();
}

function setParameter() {
  // particle
  particleSize = 0.01;
  h = particleSize * 1.5;
  stiffness = 100;
  density0 = 1000;
  viscosity = 1;
  massParticle = particleSize * particleSize * density0;
  w = new Kernel(h);
  grv = new Vector(0, -9.8);

  // region
  regionAll = new Rectangle(-0.1, -0.1, 0.8, 0.8);
  regionInner = new Rectangle(0, 0, 0.6, 0.4);
  regionInitial = new Rectangle(0, 0, 0.6, 0.2);
  thicknessWall = particleSize * 4;
  cell = new Cell(regionAll, h);

  // time
  timeDelta = 0.001;

  // canvas
  canvasWidth = 600;
  canvasHeight = canvasWidth * regionAll.height / regionAll.width;

  // blade
  regionBlade = new Rectangle(0.1, 0.25, 0.4, thicknessWall);
  const rpmBlade = 60;
  omegaBlade = rpmBlade / 60 * 2 * Math.PI;
  angleBlade = timeDelta * omegaBlade;
  const cx = regionBlade.left + 0.5 * regionBlade.width;
  const cy = regionBlade.bottom + 0.5 * regionBlade.height;
  centerBlade = new Vector(cx, cy);
}

function initialParticle() {
  const create = function(p, region) {
    const nx = Math.round(region.width / particleSize);
    const ny = Math.round(region.height / particleSize);

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = region.left + (i + 0.5) * particleSize;
        const y = region.bottom + (j + 0.5) * particleSize;
        p.push(new Particle(x, y));
      }
    }
  };

  // fluid particle
  p = [];
  create(p, regionInitial);

  // wall particle
  pWall = [];
  const width = regionInner.width + 2 * thicknessWall;
  const regionWallBottom = new Rectangle(-thicknessWall, -thicknessWall, width, thicknessWall);
  create(pWall, regionWallBottom);

  const regionWallLeft = new Rectangle(-thicknessWall, 0, thicknessWall, regionInner.height);
  create(pWall, regionWallLeft);

  const regionWallRight = new Rectangle(regionInner.right, 0, thicknessWall, regionInner.height);
  create(pWall, regionWallRight);

  // blade particle
  pBlade = [];
  create(pBlade, regionBlade);
}

function setParticleToCell() {
  cell.clear();

  // fluid particle
  cell.add(p);

  // wall particle
  cell.add(pWall);

  // blade particle
  cell.add(pBlade);
}

function densityPressure() {
  const calcDP = function(p) {
    for (let i = 0, n = p.length; i < n; i++) {
      if (!p[i].active) continue;
  
      let density = 0;
      p[i].forNeighbor(cell, function(pNeighbor, rv) {
        const r = rv.magnitude();
        density += w.kernel(r) * massParticle;
      });
      p[i].density = density;
      p[i].pressure = Math.max(stiffness * (p[i].density - density0), 0);
    }
  };

  calcDP(p);
  calcDP(pWall);
  calcDP(pBlade);
}

function particleForce() {
  for (let i = 0, n = p.length; i < n; i++) {
    if (!p[i].active) continue;

    let force = new Vector();

    p[i].forNeighbor(cell, function(pNeighbor, rv) {
      if (p[i] !== pNeighbor) {
        const r = rv.magnitude();

        // pressure force
        const wp = w.gradient(rv);
        const fp = -massParticle
          * (pNeighbor.pressure / (pNeighbor.density * pNeighbor.density)
          + p[i].pressure / (p[i].density * p[i].density));
        force.x += wp.x * fp;
        force.y += wp.y * fp;

        // viscosity force
        const r2 = r * r + 0.01 * h * h;
        const dv = p[i].velocity.sub(pNeighbor.velocity);
        const fv = massParticle * 2 * viscosity / (pNeighbor.density * p[i].density) * rv.dot(wp) / r2;
        force.x += fv * dv.x;
        force.y += fv * dv.y;
      }
    });

    // gravity force
    force.x += grv.x;
    force.y += grv.y;

    // update
    p[i].force.x = force.x;
    p[i].force.y = force.y;
  }
}

function motionUpdate() {
  // rotation blade  
  for (let i = 0, n = pBlade.length; i < n; i++) {
    const rv = pBlade[i].position.sub(centerBlade);
    pBlade[i].position.x = rv.x * Math.cos(angleBlade) - rv.y * Math.sin(angleBlade) + centerBlade.x;
    pBlade[i].position.y = rv.x * Math.sin(angleBlade) + rv.y * Math.cos(angleBlade) + centerBlade.y;
    pBlade[i].velocity.x = -omegaBlade * rv.y;
    pBlade[i].velocity.y = omegaBlade * rv.x;
  }

  // Leap-Frog
  setParticleToCell();
  densityPressure();
  particleForce();

  for (let i = 0, n = p.length; i < n; i++) {
    if (!p[i].active) continue;
    p[i].velocity2.x += p[i].force.x * timeDelta;
    p[i].velocity2.y += p[i].force.y * timeDelta;

    p[i].position.x += p[i].velocity2.x * timeDelta;
    p[i].position.y += p[i].velocity2.y * timeDelta;

    p[i].velocity.x = p[i].velocity2.x + 0.5 * p[i].force.x * timeDelta;
    p[i].velocity.y = p[i].velocity2.y + 0.5 * p[i].force.y * timeDelta;

    if ((p[i].position.x < regionAll.left)
      || (p[i].position.y < regionAll.bottom)
      || (p[i].position.x > regionAll.right) 
      || (p[i].position.y > regionAll.top)) {
      p[i].remove();
    }
  }
}

function drawParticle() {
  background(220);

  // time 
  fill("black");
  textSize(32);
  text('time = ' + time.toFixed(2), 10, 50);

  // fluid particle
  const drawEllipse = function(p, scale, d) {
    for (let i = 0, n = p.length; i < n; i++) {
      if (!p[i].active) continue;
      const x = (p[i].position.x - regionAll.left) * scale;
      const y = canvasHeight - (p[i].position.y - regionAll.bottom) * scale;
      ellipse(x, y, d);
    }
  };

  const scale = canvasWidth / regionAll.width
  const d = particleSize * scale;
  noStroke();
  fill("blue");
  drawEllipse(p, scale, d);

  // wall particle
  fill("red");
  drawEllipse(pWall, scale, d);

  // blade particle
  drawEllipse(pBlade, scale, d);
}
