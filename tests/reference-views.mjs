import assert from 'node:assert/strict';

// Executed in Chromium via CDP. Exclude warmup and disjoint measurements.
async function measureGpu() {
  const context = document.body.lastElementChild.getContext('webgl');
  const timer = context.getExtension('EXT_disjoint_timer_query');
  if (!timer) return null;
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const queries = [];
  for (let i = 0; i < 24; i++) {
    await nextFrame();
    const query = timer.createQueryEXT();
    timer.beginQueryEXT(timer.TIME_ELAPSED_EXT, query);
    globalThis.drawReference();
    timer.endQueryEXT(timer.TIME_ELAPSED_EXT);
    queries.push(query);
  }
  for (let i = 0; i < 60 && !timer.getQueryObjectEXT(queries.at(-1), timer.QUERY_RESULT_AVAILABLE_EXT); i++) await nextFrame();
  const samples = context.getParameter(timer.GPU_DISJOINT_EXT) ? [] : queries
    .filter(q => timer.getQueryObjectEXT(q, timer.QUERY_RESULT_AVAILABLE_EXT))
    .map(q => timer.getQueryObjectEXT(q, timer.QUERY_RESULT_EXT) / 1e6).sort((a, b) => a - b);
  queries.forEach(q => timer.deleteQueryEXT(q));
  return samples.length ? {samples: samples.length, median: samples[Math.floor(samples.length / 2)]} : null;
}

export async function captureReferenceViews(send, evaluate, snap, version) {
  const fixture = async () => {
    const [{ createRenderer }, { buildVehicles }, { Mesh }, { buildCity, startPosition },
      { createVehicleState }, { moveVehicle }] = await Promise.all([
      import('/src/render/renderer.js'), import('/src/render/vehicles.js'), import('/src/render/mesh.js'),
      import('/src/world/city.js'), import('/src/simulation/vehicle.js'), import('/src/simulation/vehicle-collision.js'),
    ]);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:10000';
    document.body.append(canvas);
    const renderer = createRenderer(canvas);
    const fleet = buildVehicles(renderer);
    const { landscape, cityChunks } = buildCity({ Mesh });
    renderer.upload(landscape);
    for (const chunk of cityChunks) renderer.upload(chunk.mesh);
    globalThis.frameDistrict = (eye, target) => {
      renderer.render({eye, target, focus: target, landscape, chunks: cityChunks, objects: [], contacts: [],
        scale: 1, quality: 'quality', fov: .9});
      return canvas.getContext('webgl').getError();
    };
    globalThis.frameA6 = (damaged, rear) => {
      const car = createVehicleState();
      if (damaged) {
        car.vx = 17;
        moveVehicle(car, 1 / 60, { obstacles: [{ x0: 0.98, x1: 1.20, z0: 1.20, z1: 1.54 }] });
        car.vx = 0;
        car.vz = 23;
        moveVehicle(car, 1 / 60, { obstacles: [{ x0: 0.64, x1: 0.91, z0: 2.50, z1: 2.70 }] });
      }
      Object.assign(car, startPosition);
      const scene = fleet.scene(car, [], [], () => 'red', { cockpit: false, far: 90, headlights: true, dusk: 0, street: [] });
      const render = () => renderer.render({ ...scene, chunks: cityChunks, landscape, scale: 1, quality: 'quality',
        eye: [car.x + 3.1, 1.62, car.z + (rear ? -4.55 : 4.55)], target: [car.x + 0.15, 0.67, car.z + (rear ? -0.72 : 0.72)],
        focus: [car.x, 0, car.z], headlights: true, fov: 0.78 });
      for (let i = 0; i < 8; i++) render();
      globalThis.drawReference = render;
      return { dents: [...car.dents].filter((_, i) => i % 4 === 2), wheels: car.wheelDamage,
        gl: canvas.getContext('webgl').getError() };
    };
    return true;
  };
  const result = await send('Runtime.evaluate', { expression: '(' + fixture.toString() + ')()', awaitPromise: true, returnByValue: true });
  assert.equal(result.result.value, true, result.exceptionDetails?.exception?.description);
  for (const [name, args] of [['Front','false,false'], ['Heck','false,true'], ['Crash','true,false']]) {
    const frame = await evaluate('frameA6(' + args + ')');
    assert.equal(frame.gl, 0);
    await snap('Audi-' + version + '-' + name);
  }
  const gpuTime = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: '(' + measureGpu.toString() + ')()' });
  assert.equal(gpuTime.exceptionDetails, undefined);
  console.log('GPU reference view (ms):', gpuTime.result.value);
  for (const [name, eye, target] of [
    ['Giesserei', [155,8,-65], [174,3,-31]], ['Altstadt', [-53,4,-139], [-34,6,-113]],
    ['Innenstadt', [-120,4,-137], [-108,7,-100]],
  ]) {
    assert.equal(await evaluate('frameDistrict(' + JSON.stringify(eye) + ',' + JSON.stringify(target) + ')'), 0);
    await snap('Audi-' + version + '-' + name);
  }
}
