import { moveVehicle } from './vehicle-collision.js';
export { vehicleOverlapsTraffic } from './vehicle-collision.js';

const MASS = 1575;
const GRAVITY = 9.81;
const WHEELBASE = 2.69;
const TIRE_RADIUS = 0.315;
const FRONT_WEIGHT_FRACTION = 0.60;
const FRONT_AXLE = WHEELBASE * (1 - FRONT_WEIGHT_FRACTION);
const REAR_AXLE = WHEELBASE * FRONT_WEIGHT_FRACTION;
const YAW_INERTIA = 2650;
const CG_HEIGHT = 0.54;
const FINAL_DRIVE = 3.89;
const RATIOS = [3.67, 2.06, 1.36, 1.03, 0.84];
const REVERSE_RATIO = 3.40;
const IDLE_RPM = 850;
const REDLINE = 6400;
const SURFACES = {
  asphalt: { grip: 0.94, rolling: 0.013, roughness: 0.002 },
  paving: { grip: 0.76, rolling: 0.020, roughness: 0.010 },
  grass: { grip: 0.49, rolling: 0.050, roughness: 0.024 },
};

const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
const mix = (from, to, weight) => from + (to - from) * weight;
const follow = (from, to, rate, dt) => mix(from, to, 1 - Math.exp(-rate * dt));
const pedal = (value) => clamp(Number(value) || 0, 0, 1);
const wheelToCrank = (speed, ratio) => Math.abs(speed) * ratio * FINAL_DRIVE * 60 / (2 * Math.PI * TIRE_RADIUS);

export function createVehicleState() {
  return {
    x: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, yaw: 0, steer: 0, spin: 0, km: 0,
    roll: 0, pitch: 0, heave: 0, rollRate: 0, pitchRate: 0, heaveRate: 0,
    throttle: 0, gearIndex: 0, shiftTimer: 0, rpm: IDLE_RPM, gear: 'N', reverseArmed: true,
    road: true, surface: 'asphalt', brakeLights: false, reverseLights: false,
    collisionImpact: 0, skid: 0, longitudinalAccel: 0,
  };
}

function updateGearbox(car, speed, throttle, reverse, braking, dt) {
  car.shiftTimer = Math.max(0, car.shiftTimer - dt);
  if (reverse) {
    car.gearIndex = 0;
    car.shiftTimer = 0;
  } else if (car.shiftTimer === 0) {
    const rpm = wheelToCrank(speed, RATIOS[car.gearIndex]);
    const upshiftRpm = mix(3550, 5650, throttle);
    if (!braking && car.gearIndex < RATIOS.length - 1 && rpm > upshiftRpm) {
      car.gearIndex++;
      car.shiftTimer = 0.24;
    } else if (car.gearIndex > 0 && rpm < mix(1500, 2250, throttle)) {
      car.gearIndex--;
      car.shiftTimer = 0.17;
    }
  }
  const ratio = reverse ? REVERSE_RATIO : RATIOS[car.gearIndex];
  const coupledRpm = wheelToCrank(speed, ratio);
  const converterRpm = IDLE_RPM + throttle * 1900 * (1 - clamp(Math.abs(speed) / 10, 0, 1));
  car.rpm = follow(car.rpm, clamp(Math.max(coupledRpm, converterRpm), IDLE_RPM, REDLINE), 10, dt);
  car.gear = reverse ? 'R' : Math.abs(speed) < 0.08 && throttle === 0 ? 'N' : `D${car.gearIndex + 1}`;
  return ratio;
}

function engineTorque(rpm) {
  // Approximate torque curve for a naturally aspirated 1990s V6.
  if (rpm < 3200) return mix(145, 250, clamp((rpm - IDLE_RPM) / 2350, 0, 1));
  if (rpm < 5500) return mix(250, 209, (rpm - 3200) / 2300);
  return mix(209, 0, clamp((rpm - 5500) / (REDLINE - 5500), 0, 1));
}

function surfaceAt(car, { roadSurfaceAt, roads = [] }) {
  if (roadSurfaceAt) return roadSurfaceAt(car.x, car.z);
  if (roads.length === 0 || roads.some((center) => Math.abs(car.x - center) < 9 || Math.abs(car.z - center) < 9)) return 'asphalt';
  return 'grass';
}

function suspension(car, position, rate, target, frequency, damping, dt) {
  car[rate] += ((target - car[position]) * frequency ** 2 - car[rate] * 2 * damping * frequency) * dt;
  car[position] += car[rate] * dt;
}

function updateBody(car, surface, lateralAccel, dt) {
  const bumpSpeed = clamp(Math.abs(car.speed) / 8, 0, 1);
  const bumps = Math.sin(car.x * 2.0 + car.z * 1.57) + 0.42 * Math.sin(car.x * 4.7 - car.z * 3.1);
  const targetHeave = surface.roughness * bumps * bumpSpeed;
  const targetPitch = clamp(-car.longitudinalAccel * 0.0042, -0.039, 0.055);
  const targetRoll = clamp(lateralAccel * 0.0081, -0.088, 0.088);
  suspension(car, 'heave', 'heaveRate', targetHeave, 16, 0.60, dt);
  suspension(car, 'pitch', 'pitchRate', targetPitch, 11, 0.66, dt);
  suspension(car, 'roll', 'rollRate', targetRoll, 9, 0.72, dt);
}

function tireLateralForce(slip, stiffness, grip, longitudinal) {
  // Longitudinal forces leave less of the friction circle for cornering.
  const lateralBudget = Math.sqrt(Math.max(0, grip * grip - longitudinal * longitudinal));
  return lateralBudget > 0 ? -lateralBudget * Math.tanh(stiffness * slip / lateralBudget) : 0;
}

export function stepVehicle(car, input, dt, world = {}) {
  const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
  const longitudinal = car.vx * sin + car.vz * cos;
  const lateral = car.vx * cos - car.vz * sin;
  const speed = Math.abs(longitudinal);
  car.collisionImpact = 0;
  const surfaceName = surfaceAt(car, world);
  car.surface = Object.hasOwn(SURFACES, surfaceName) ? surfaceName : 'asphalt';
  car.road = car.surface === 'asphalt';
  const surface = SURFACES[car.surface];

  const requestedThrottle = pedal(input.throttle);
  const requestedBrake = pedal(input.brake);
  const handbrake = pedal(input.handbrake);
  // Stop before changing direction. Releasing the brake allows the next
  // press at rest to act as the reverse pedal.
  if (!requestedBrake) car.reverseArmed = true;
  else if (longitudinal > 0.30 || requestedThrottle) car.reverseArmed = false;
  const reverseDrive = requestedBrake > 0 && car.reverseArmed && !requestedThrottle && !handbrake;
  const reverse = reverseDrive || (car.reverseLights && longitudinal < -0.11);
  const serviceBrake = Math.max(reverseDrive ? 0 : requestedBrake, longitudinal < -0.12 ? requestedThrottle : 0);
  const driveCommand = serviceBrake > 0 ? 0 : reverseDrive ? requestedBrake : requestedThrottle;
  car.throttle = follow(car.throttle, driveCommand, driveCommand > car.throttle ? 6.2 : 12, dt);
  car.brakeLights = serviceBrake > 0 || handbrake > 0;
  car.reverseLights = reverse;
  const ratio = updateGearbox(car, longitudinal, driveCommand, reverse, car.brakeLights, dt);

  const steering = clamp(input.steer ?? pedal(input.right) - pedal(input.left), -1, 1);
  const steerLimit = (0.53 + 0.009 * speed) / (1 + (speed / 10) ** 1.65);
  car.steer = follow(car.steer, steering * steerLimit, steering === 0 ? 6.8 : 5.6, dt);
  const steerSin = Math.sin(car.steer), steerCos = Math.cos(car.steer);

  const loadTransfer = clamp(MASS * car.longitudinalAccel * CG_HEIGHT / WHEELBASE, -3700, 3700);
  const frontLoad = MASS * GRAVITY * FRONT_WEIGHT_FRACTION - loadTransfer;
  const rearLoad = MASS * GRAVITY - frontLoad;
  const frontGrip = frontLoad * surface.grip * 0.96;
  const rearGrip = rearLoad * surface.grip;
  const shiftPower = car.shiftTimer > 0 ? mix(1, 0.23, clamp(car.shiftTimer / 0.20, 0, 1)) : 1;
  const reversePower = reverseDrive ? -0.64 * (1 - clamp(speed / 9, 0, 1) ** 4) : 1;
  const traction = driveCommand > 0 ? car.throttle * reversePower * engineTorque(car.rpm) *
    ratio * FINAL_DRIVE * 0.87 * shiftPower / TIRE_RADIUS : 0;

  const direction = Math.sign(longitudinal);
  const brakeForce = Math.min(MASS * 11.5 * serviceBrake, MASS * speed / dt);
  const rearBrake = Math.min(MASS * 5.4 * handbrake, MASS * speed / dt);
  const frontLong = clamp(traction - direction * brakeForce * 0.68, -frontGrip, frontGrip);
  const rearLong = clamp(-direction * (brakeForce * 0.32 + rearBrake), -rearGrip, rearGrip);
  const coupledDrag = (!driveCommand && !serviceBrake) ? 110 * ratio * clamp(speed / 6, 0, 1) : 0;
  const resistance = direction * Math.min(MASS * speed / dt,
    MASS * GRAVITY * surface.rolling + 0.44 * speed * speed + coupledDrag);

  // A front-heavy two-axle bicycle model. Below walking speed the dynamic
  // slip angles become ill-conditioned, so blend with steering geometry.
  const speedForSlip = Math.max(speed, 2.5);
  const frontSlip = Math.atan2(lateral + FRONT_AXLE * car.yaw, speedForSlip) - car.steer * direction;
  const rearSlip = Math.atan2(lateral - REAR_AXLE * car.yaw, speedForSlip);
  const frontLat = tireLateralForce(frontSlip, 58_000, frontGrip, frontLong);
  const rearLat = tireLateralForce(rearSlip, 55_000 * (1 - 0.73 * handbrake), rearGrip, rearLong);
  const dynamicWeight = clamp((speed - 1.5) / 3.2, 0, 1);
  const lateralAccel = (frontLat * steerCos + frontLong * steerSin + rearLat) / MASS;
  const longAccel = (frontLong * steerCos - frontLat * steerSin + rearLong - resistance) / MASS;
  let nextLong = longitudinal + (longAccel + car.yaw * lateral * dynamicWeight) * dt;
  if (driveCommand === 0 && longitudinal * nextLong < 0) nextLong = 0;
  car.longitudinalAccel = follow(car.longitudinalAccel, longAccel, 11, dt);

  const dynamicYaw = car.yaw + ((frontLat * steerCos + frontLong * steerSin) * FRONT_AXLE - rearLat * REAR_AXLE) / YAW_INERTIA * dt;
  const bicycleYaw = nextLong * Math.tan(car.steer) / WHEELBASE;
  car.yaw = mix(follow(car.yaw, bicycleYaw, 12, dt), dynamicYaw, dynamicWeight);
  const slipVelocity = mix(follow(lateral, bicycleYaw * REAR_AXLE, 15, dt),
    lateral + (lateralAccel - car.yaw * nextLong) * dt, dynamicWeight);
  const nextHeading = car.heading + car.yaw * dt;
  const nextSin = Math.sin(nextHeading), nextCos = Math.cos(nextHeading);
  car.vx = nextLong * nextSin + slipVelocity * nextCos;
  car.vz = nextLong * nextCos - slipVelocity * nextSin;

  const frontUse = Math.hypot(frontLong, frontSlip * 58_000) / frontGrip;
  const rearUse = Math.hypot(rearLong, rearSlip * 55_000) / rearGrip;
  const skid = clamp((Math.max(frontUse, rearUse) - 0.85) / 1.2, 0, 1) * clamp(speed / 5, 0, 1);
  car.skid = follow(car.skid, skid, 12, dt);

  moveVehicle(car, dt, world);
  car.speed = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
  car.spin += car.speed * dt / TIRE_RADIUS;
  updateBody(car, surface, mix(car.yaw * car.speed, lateralAccel, dynamicWeight), dt);
}
