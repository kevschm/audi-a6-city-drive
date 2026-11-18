export const TIRE_RADIUS = 0.315;
export const FRONT_WHEEL_Z = 1.39;
export const REAR_WHEEL_Z = -1.30;
export const WHEELBASE = FRONT_WHEEL_Z - REAR_WHEEL_Z;
export const HALF_TRACK = 0.759;

// Wheel arrays are ordered front left, front right, rear left, rear right.
export const WHEEL_CONTACTS = [
  [-HALF_TRACK, FRONT_WHEEL_Z], [HALF_TRACK, FRONT_WHEEL_Z],
  [-HALF_TRACK, REAR_WHEEL_Z], [HALF_TRACK, REAR_WHEEL_Z],
];

const CONTACT_SAMPLE = 0.21;
const TIRE_ARC_RISE = TIRE_RADIUS - Math.sqrt(TIRE_RADIUS ** 2 - CONTACT_SAMPLE ** 2);

const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

export function wheelSurfaceAt(surfaceAt, x, z, surfaces, fallback) {
  const name = surfaceAt?.(x, z);
  return Object.hasOwn(surfaces, name) ? surfaces[name] : fallback;
}

function tireEnvelope(groundHeightAt, x, z, forwardX, forwardZ) {
  if (!groundHeightAt) return 0;
  const dx = forwardX * CONTACT_SAMPLE;
  const dz = forwardZ * CONTACT_SAMPLE;
  // A tire can touch the rising face before its axle crosses the curb.
  return Math.max(groundHeightAt(x, z),
    groundHeightAt(x + dx, z + dz) - TIRE_ARC_RISE,
    groundHeightAt(x - dx, z - dz) - TIRE_ARC_RISE);
}

function updateWheelContact(car, i, ground, dt) {
  const height = car.wheelTravel[i];
  const frequency = 33;
  const damping = 0.83;
  const velocity = car.wheelVelocity[i] + ((ground - height) * frequency ** 2 -
    car.wheelVelocity[i] * 2 * damping * frequency) * dt;
  const candidate = height + velocity * dt;
  const contactFloor = ground - 0.006;

  // Support the tire on steps immediately. The remaining motion damps out
  // as the wheel moves down the other side or the suspension compresses.
  car.wheelTravel[i] = Math.max(contactFloor, candidate);
  car.wheelVelocity[i] = candidate < contactFloor ? clamp((contactFloor - height) / dt * 0.2, 0, 0.7) : velocity;
}

function spring(car, position, rate, target, frequency, damping, dt) {
  car[rate] += ((target - car[position]) * frequency ** 2 - car[rate] * 2 * damping * frequency) * dt;
  car[position] += car[rate] * dt;
}

export function stepSuspension(car, world, surfaces, fallbackSurface, handbrake, dt) {
  const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
  const lateral = car.vx * cos - car.vz * sin;
  const bumpSpeed = clamp(Math.abs(car.speed) / 8, 0, 1);
  const steerTangent = Math.tan(car.steer);

  for (let i = 0; i < WHEEL_CONTACTS.length; i++) {
    const [wheelX, wheelZ] = WHEEL_CONTACTS[i];
    const x = car.x + cos * wheelX + sin * wheelZ;
    const z = car.z - sin * wheelX + cos * wheelZ;
    const front = i < 2;
    const wheelSteer = front ? Math.atan(steerTangent / (1 - wheelX * steerTangent / WHEELBASE)) : 0;
    const angle = car.heading + wheelSteer;
    const ground = tireEnvelope(world.groundHeightAt, x, z, Math.sin(angle), Math.cos(angle));
    car.wheelGround[i] = ground;
    const { roughness } = wheelSurfaceAt(world.roadSurfaceAt, x, z, surfaces, fallbackSurface);
    const bumps = Math.sin(x * 2.0 + z * 1.57) + 0.42 * Math.sin(x * 4.7 - z * 3.1);
    updateWheelContact(car, i, ground + roughness * bumps * bumpSpeed, dt);

    // Ackermann geometry splits the steering angle and lets inner wheels
    // turn less distance through a corner. The handbrake locks the rear pair.
    car.wheelSteer[i] = wheelSteer;
    const wheelSpeed = (car.speed - car.yaw * wheelX) * Math.cos(wheelSteer) +
      (lateral + car.yaw * wheelZ) * Math.sin(wheelSteer);
    car.wheelSpin[i] += wheelSpeed * dt / TIRE_RADIUS * (front ? 1 : 1 - handbrake);
  }

  const [frontLeft, frontRight, rearLeft, rearRight] = car.wheelTravel;
  const front = (frontLeft + frontRight) * 0.5, rear = (rearLeft + rearRight) * 0.5;
  const riseRight = (frontRight + rearRight - frontLeft - rearLeft) * 0.5;
  const targetPitch = Math.atan2(rear - front, WHEELBASE) + clamp(-car.longitudinalAccel * 0.0042, -0.039, 0.055);
  const targetRoll = Math.atan2(riseRight, 2 * HALF_TRACK) + clamp(car.lateralAccel * 0.0081, -0.088, 0.088);
  spring(car, 'heave', 'heaveRate', (front + rear) * 0.5, 14, 0.66, dt);
  spring(car, 'pitch', 'pitchRate', targetPitch, 11, 0.68, dt);
  spring(car, 'roll', 'rollRate', targetRoll, 9, 0.74, dt);
}
