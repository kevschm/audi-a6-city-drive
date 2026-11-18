export const VEHICLE_MASS = 1575;
export const VEHICLE_YAW_INERTIA = 2650;

export const CONTACT_MATERIALS = {
  concrete: { restitution: 0.055, friction: 0.42, crushShare: 1 },
  steel: { restitution: 0.09, friction: 0.33, crushShare: 0.86 },
  car: { restitution: 0.12, friction: 0.46, crushShare: 0.60 },
  wood: { restitution: 0.18, friction: 0.48, crushShare: 0.36 },
  plastic: { restitution: 0.24, friction: 0.49, crushShare: 0.18 },
};

// A normal points from B towards A. Heading rotates +Z towards +X.
export function solveContact(a, b, nx, nz, x, z, material) {
  const ax = x - a.x, az = z - a.z, bx = x - b.x, bz = z - b.z;
  const massA = 1 / a.mass, massB = 1 / b.mass;
  const inertiaA = 1 / a.inertia, inertiaB = 1 / b.inertia;
  const tx = -nz, tz = nx;
  const armA = az * nx - ax * nz, armB = bz * nx - bx * nz;
  const tangentA = az * tx - ax * tz, tangentB = bz * tx - bx * tz;
  const vx = a.vx + a.yaw * az - b.vx - b.yaw * bz;
  const vz = a.vz - a.yaw * ax - b.vz + b.yaw * bx;
  const closingSpeed = Math.max(0, -(vx * nx + vz * nz));
  const signedSlip = vx * tx + vz * tz;
  const impactSpeed = Math.hypot(a.vx, a.vz);
  const normalMass = massA + massB + armA ** 2 * inertiaA + armB ** 2 * inertiaB;
  const restitution = material.restitution * Math.min(1, Math.max(0, (closingSpeed - 0.4) / 3));
  const normalImpulse = (1 + restitution) * closingSpeed / normalMass;

  // The normal impulse also changes slip at an offset contact. Solve friction
  // against that updated velocity and bound it by the Coulomb cone.
  const afterNormal = signedSlip + normalImpulse * (armA * tangentA * inertiaA + armB * tangentB * inertiaB);
  const tangentMass = massA + massB + tangentA ** 2 * inertiaA + tangentB ** 2 * inertiaB;
  const frictionLimit = material.friction * normalImpulse;
  const frictionImpulse = Math.max(-frictionLimit, Math.min(frictionLimit, -afterNormal / tangentMass));
  const ix = nx * normalImpulse + tx * frictionImpulse;
  const iz = nz * normalImpulse + tz * frictionImpulse;
  return {
    ix, iz, normalImpulse, frictionImpulse, closingSpeed, impactSpeed, scrapeSpeed: Math.abs(signedSlip),
    angle: Math.atan2(Math.abs(signedSlip), closingSpeed) * 180 / Math.PI,
    energy: 0.5 * closingSpeed ** 2 / normalMass * (1 - restitution ** 2),
    deltaV: Math.hypot(ix, iz) * massA,
    aYaw: (az * ix - ax * iz) * inertiaA,
    bYaw: -(bz * ix - bx * iz) * inertiaB,
  };
}
