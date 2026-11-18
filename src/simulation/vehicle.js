import { moveVehicle } from './vehicle-collision.js';
import { HALF_TRACK, TIRE_RADIUS, WHEELBASE, WHEEL_CONTACTS, stepSuspension, wheelSurfaceAt } from './vehicle-suspension.js';
export { vehicleOverlapsTraffic } from './vehicle-collision.js';

const MASS = 1575;
const GRAVITY = 9.81;
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
    wheelTravel: [0, 0, 0, 0], wheelVelocity: [0, 0, 0, 0], wheelGround: [0, 0, 0, 0],
    wheelSteer: [0, 0, 0, 0], wheelSpin: [0, 0, 0, 0],
    throttle: 0, gearIndex: 0, shiftTimer: 0, rpm: IDLE_RPM, gear: 'N', reverseArmed: true,
    road: true, surface: 'asphalt', brakeLights: false, reverseLights: false,
    collisionImpact: 0, skid: 0, longitudinalAccel: 0, lateralAccel: 0,
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

function tireLateralForce(slip, stiffness, grip, longitudinal) {
  // Longitudinal forces leave less of the friction circle for cornering.
  const lateralBudget = Math.sqrt(Math.max(0, grip * grip - longitudinal * longitudinal));
  return lateralBudget > 0 ? -lateralBudget * Math.tanh(stiffness * slip / lateralBudget) : 0;
}

function axleSurfaceGrip(car, surfaceAt, fallbackSurface, leftWeight, sin, cos, axle) {
  if (!surfaceAt) return fallbackSurface.grip;
  const left = WHEEL_CONTACTS[axle * 2], right = WHEEL_CONTACTS[axle * 2 + 1];
  const axleX = car.x + sin * left[1];
  const axleZ = car.z + cos * left[1];
  const leftGrip = wheelSurfaceAt(surfaceAt, axleX + cos * left[0], axleZ - sin * left[0], SURFACES, fallbackSurface).grip;
  const rightGrip = wheelSurfaceAt(surfaceAt, axleX + cos * right[0], axleZ - sin * right[0], SURFACES, fallbackSurface).grip;
  return mix(rightGrip, leftGrip, leftWeight);
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
  const centering = steering === 0 || steering * car.steer < 0;
  const steerRate = centering ? 8.1 : mix(6.6, 5.3, clamp(speed / 26, 0, 1));
  car.steer = follow(car.steer, steering * steerLimit, steerRate, dt);
  const steerSin = Math.sin(car.steer), steerCos = Math.cos(car.steer);

  const loadTransfer = clamp(MASS * car.longitudinalAccel * CG_HEIGHT / WHEELBASE, -3700, 3700);
  const frontLoad = MASS * GRAVITY * FRONT_WEIGHT_FRACTION - loadTransfer;
  const rearLoad = MASS * GRAVITY - frontLoad;
  // Lateral load transfer places grip priority on the outside wheels. This
  // matters when one side rides on paving or grass and the other on asphalt.
  const leftWeight = 0.5 + clamp(car.lateralAccel * CG_HEIGHT / (2 * GRAVITY * HALF_TRACK), -0.32, 0.32);
  const frontGrip = frontLoad * axleSurfaceGrip(car, world.roadSurfaceAt, surface, leftWeight, sin, cos, 0) * 0.96;
  const rearGrip = rearLoad * axleSurfaceGrip(car, world.roadSurfaceAt, surface, leftWeight, sin, cos, 1);
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
  const frontLateral = lateral + FRONT_AXLE * car.yaw;
  const frontRolling = longitudinal * steerCos + frontLateral * steerSin;
  const frontSlip = Math.atan2(frontLateral * steerCos - longitudinal * steerSin, Math.max(2.5, Math.abs(frontRolling)));
  const rearSlip = Math.atan2(lateral - REAR_AXLE * car.yaw, speedForSlip);
  const frontLat = tireLateralForce(frontSlip, 58_000, frontGrip, frontLong);
  const rearLat = tireLateralForce(rearSlip, 55_000 * (1 - 0.73 * handbrake), rearGrip, rearLong);
  const dynamicWeight = clamp((speed - 1.5) / 3.2, 0, 1);
  const lateralAccel = (frontLat * steerCos + frontLong * steerSin + rearLat) / MASS;
  const [frontLeft, frontRight, rearLeft, rearRight] = car.wheelGround;
  const grade = clamp((rearLeft + rearRight - frontLeft - frontRight) / (2 * WHEELBASE), -0.22, 0.22);
  const longAccel = (frontLong * steerCos - frontLat * steerSin + rearLong - resistance) / MASS +
    GRAVITY * grade * clamp(speed / 1.5, 0, 1);
  let nextLong = longitudinal + longAccel * dt;
  if (driveCommand === 0 && longitudinal * nextLong < 0) nextLong = 0;
  car.longitudinalAccel = follow(car.longitudinalAccel, longAccel, 11, dt);

  const dynamicYaw = car.yaw + ((frontLat * steerCos + frontLong * steerSin) * FRONT_AXLE - rearLat * REAR_AXLE) / YAW_INERTIA * dt;
  const bicycleYaw = nextLong * Math.tan(car.steer) / WHEELBASE;
  car.yaw = mix(follow(car.yaw, bicycleYaw, 12, dt), dynamicYaw, dynamicWeight);
  const nextHeading = car.heading + car.yaw * dt;
  const nextSin = Math.sin(nextHeading), nextCos = Math.cos(nextHeading);
  const crawlSlip = follow(lateral, bicycleYaw * REAR_AXLE, 15, dt);
  const dynamicSlip = lateral + lateralAccel * dt;
  // Integrate tire forces in the current world orientation. Turning the
  // chassis does not rotate the car's momentum with it.
  car.vx = mix(nextLong * nextSin + crawlSlip * nextCos, nextLong * sin + dynamicSlip * cos, dynamicWeight);
  car.vz = mix(nextLong * nextCos - crawlSlip * nextSin, nextLong * cos - dynamicSlip * sin, dynamicWeight);
  car.lateralAccel = follow(car.lateralAccel, mix(car.yaw * nextLong, lateralAccel, dynamicWeight), 12, dt);

  const frontUse = Math.hypot(frontLong, frontSlip * 58_000) / frontGrip;
  const rearUse = Math.hypot(rearLong, rearSlip * 55_000) / rearGrip;
  const skid = clamp((Math.max(frontUse, rearUse) - 0.85) / 1.2, 0, 1) * clamp(speed / 5, 0, 1);
  car.skid = follow(car.skid, skid, 12, dt);

  moveVehicle(car, dt, world);
  car.speed = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
  if (car.collisionImpact > 0.7) car.pitchRate += clamp((nextLong - car.speed) * 0.035, -0.55, 0.55);
  car.spin += car.speed * dt / TIRE_RADIUS;
  stepSuspension(car, world, SURFACES, surface, handbrake, dt);
}
