import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import RBush from 'rbush';
import './App.css';

import countryMeta from '../public/countries-map.json';

function lonLatToVec3(lon, lat, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function pointInRing(point, ring) {
  let [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!polygon || !polygon.length) return false;
  const outer = polygon[0];
  if (!pointInRing(point, outer)) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

function pointInMultiPolygon(point, multi) {
  for (const poly of multi) {
    if (pointInPolygon(point, poly)) return true;
  }
  return false;
}

// Compute bounding box for polygons
function computeBBox(coords) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const processRing = (ring) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };

  for (const poly of coords) {
    for (const ring of poly) {
      processRing(ring);
    }
  }
  return [minX, minY, maxX, maxY];
}

const WIKI_TITLE_OVERRIDES = {
  'United States of America': 'United States',
  'Republic of the Congo': 'Republic of the Congo',
  'Democratic Republic of the Congo': 'Democratic Republic of the Congo',
  'Ivory Coast': "Côte d'Ivoire",
  Czechia: 'Czech Republic',
  Eswatini: 'Eswatini',
  'North Macedonia': 'North Macedonia',
  Burma: 'Myanmar',
  'Timor-Leste': 'East Timor',
};

const fetchCache = new Map();
async function cachedJSON(url) {
  if (fetchCache.has(url)) return fetchCache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed ${r.status} for ${url}`);
    return r.json();
  });
  fetchCache.set(url, p);
  return p;
}

export default function GlobeWikipediaApp() {
  const mountRef = useRef(null);
  const tooltipRef = useRef(null);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [status, setStatus] = useState('Loading globe…');
  const stateRef = useRef({ features: [] });
  const [quizType, setQuizType] = useState('flag'); // user-selected quiz type
  const [quizQuestion, setQuizQuestion] = useState(null);
  const [feedback, setFeedback] = useState('');
  const quizRef = useRef(null);

  const [quizMode, setQuizMode] = useState(false);
  const quizModeRef = useRef(false);
  useEffect(() => {
    quizModeRef.current = quizMode;
  }, [quizMode]); // TODO: Unnecessary
  const [correctCount, setCorrectCount] = useState(0); // first-try correct per question
  const [totalCount, setTotalCount] = useState(0); // total attempts
  const accuracy =
    totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0); // seconds

  // ---------- Generate Quiz Question ----------
  function nextQuestion() {
    const countryNames = Object.keys(countryMeta);
    const country =
      countryNames[Math.floor(Math.random() * countryNames.length)];

    // const types = ['flag', 'capital', 'name'];
    // const type = types[Math.floor(Math.random() * types.length)];

    const type = quizType;

    const question = {
      country,
      type,
      flag: countryMeta[country].flag,
      capital: countryMeta[country].capital,
    };

    setQuizQuestion(question);
    quizRef.current = question; // update ref
    setFeedback('');
  }

  // ---------- Check Quiz Answer ----------
  function handleGlobeClick(clickedCountry) {
    console.log('Clicked country:', clickedCountry);
    if (!quizRef.current) return;
    const correctCountry = quizRef.current.country;

    setTotalCount((t) => t + 1);
    if (clickedCountry === correctCountry) {
      setCorrectCount((c) => c + 1);
      const wasFirstTry = quizRef.current.firstTryFlag;
      if (wasFirstTry) {
        // setFeedback('✅ Correct!');
        highlightCountry(correctCountry, 0x00ff00);
      } else {
        // setFeedback(`✅ Correct (not first try).`);
        highlightCountry(correctCountry, 0xffff00);
      }
      nextQuestion();
    } else {
      quizRef.current.firstTryFlag = false;
      if (quizRef.current.type === 'name') {
        setFeedback(`❌ Wrong!`);
      } else {
        setFeedback(`❌ Wrong! Correct country: ${correctCountry}`);
      }
    }
  }
  function startQuiz() {
    setCorrectCount(0);
    setTotalCount(0);
    setElapsed(0);
    setQuizMode(true);
    nextQuestion();
  }
  function endQuiz() {
    setQuizMode(false);
    setQuizQuestion(null);
    setFeedback('');
    // clearAllCountryColors();
  }
  function clearAllCountryColors() {
    const mats = stateRef.current.materialByCountry;
    mats.forEach((mat) => {
      mat.color.setHex(0xffffff);
      mat.opacity = 0.65;
      mat.transparent = true;
      mat.needsUpdate = true;
    });
  }
  function highlightCountry(name, color = 0x00ff00) {
    const lines = stateRef.current.countryLines[name];
    if (!lines) return;

    lines.forEach((line) => {
      line.material = line.material.clone(); // clone to avoid affecting others
      line.material.color.setHex(color);
    });
  }

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshNormalMaterial()
    );
    scene.add(cube);

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 8;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(-5, 3, 1);
    scene.add(dir);

    const group = new THREE.Group();
    scene.add(group);
    const R = 2;

    const sphereGeo = new THREE.SphereGeometry(R, 96, 96);
    const texLoader = new THREE.TextureLoader();
    const earthTexUrl = '/8k_earth_daymap.jpg';
    const bumpUrl = '/8k_earth_normal_map.jpg';
    const specUrl = '/8k_earth_specular_map.jpg';

    const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    Promise.all([
      new Promise((res) => texLoader.load(earthTexUrl, res)),
      new Promise((res) => texLoader.load(bumpUrl, res)),
      new Promise((res) => texLoader.load(specUrl, res)),
    ]).then(([map, bumpMap, specMap]) => {
      map.anisotropy = 8;
      material.map = map;
      material.bumpMap = bumpMap;
      material.bumpScale = 0.03;
      material.specularMap = specMap;
      material.shininess = 8;
      material.needsUpdate = true;
    });
    const globe = new THREE.Mesh(sphereGeo, material);
    group.add(globe);

    const atm = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.02, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.08,
      })
    );
    group.add(atm);

    const bordersGroup = new THREE.Group();
    group.add(bordersGroup);

    const fetchBorders = async () => {
      setStatus('Loading country borders…');
      const url =
        'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
      const geo = await cachedJSON(url);
      const features = geo.features;

      const lineMat = new THREE.LineBasicMaterial({
        linewidth: 1,
        transparent: false,
        opacity: 0.65,
        color: 0xffffff,
      });

      // This lets us map country names to materials
      // so we can highlight them later
      const countryLines = {}; // store country name -> array of line objects

      for (const f of features) {
        const geom = f.geometry;
        const coords = geom.coordinates;
        const type = geom.type;
        const lines = [];

        const addRing = (ring) => {
          const pts = [];
          for (const [lon, lat] of ring) {
            const v = lonLatToVec3(lon, lat, R * 1.002);
            pts.push(v.x, v.y, v.z);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          const line = new THREE.LineLoop(g, lineMat);
          bordersGroup.add(line);
          lines.push(line);
        };

        if (type === 'Polygon') {
          for (const ring of coords) addRing(ring);
        } else if (type === 'MultiPolygon') {
          for (const poly of coords) {
            for (const ring of poly) addRing(ring);
          }
        }

        const name = f.properties.name || 'Unknown';
        countryLines[name] = lines;
      }
      stateRef.current.countryLines = countryLines;

      // Build R-tree for hover detection
      const tree = new RBush();
      const items = features.map((f) => {
        const props = f.properties || {};
        const name = props.ADMIN || props.NAME || props.name || 'Unknown';
        const geom = f.geometry;
        let bbox = null;
        if (geom) {
          if (geom.type === 'Polygon') bbox = computeBBox([geom.coordinates]);
          else if (geom.type === 'MultiPolygon')
            bbox = computeBBox(geom.coordinates);
        }
        const item = {
          minX: bbox ? bbox[0] : 0,
          minY: bbox ? bbox[1] : 0,
          maxX: bbox ? bbox[2] : 0,
          maxY: bbox ? bbox[3] : 0,
          feature: { name, geometry: geom },
        };
        tree.insert(item);
        return item;
      });

      stateRef.current.features = items;
      stateRef.current.tree = tree;

      setStatus('Ready');
    };

    fetchBorders().catch((e) => setStatus(`Error: ${e.message}`));

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let mouseDownPos = { x: 0, y: 0 };

    function onResize() {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    function onMouseDown(ev) {
      mouseDownPos = { x: ev.clientX, y: ev.clientY };
      isDragging = false;
    }

    function onMouseMoveDrag(ev) {
      if (
        Math.abs(ev.clientX - mouseDownPos.x) > 2 ||
        Math.abs(ev.clientY - mouseDownPos.y) > 2
      )
        isDragging = true;
    }

    function onMouseMove(ev) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(globe, false);
      if (intersects.length) {
        const p = intersects[0].point.clone().normalize();
        const lat = 90 - (Math.acos(p.y) * 180) / Math.PI;
        let lon = (Math.atan2(p.z, -p.x) * 180) / Math.PI - 180;
        if (lon < -180) lon += 360;
        if (lon > 180) lon -= 360;
        const point = [lon, lat];
        const feature = hitCountry(point, stateRef.current.tree);
        if (feature) {
          // const screenPos = {
          //   x: ev.clientX - rect.left,
          //   y: ev.clientY - rect.top,
          // };
          // updateHover(feature, screenPos);
          const meta = countryMeta[feature.name] || {};
          setHoverInfo({
            country: meta.name || feature.name,
            capital: meta.capital || '—',
            flagUrl: meta.flag || null,
            pos: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
          });
        } else {
          setHoverInfo(null);
        }
      } else {
        setHoverInfo(null);
      }
    }

    function hitCountry(point, tree) {
      const [lon, lat] = point;
      const candidates = tree.search({
        minX: lon,
        minY: lat,
        maxX: lon,
        maxY: lat,
      });

      for (const item of candidates) {
        const geom = item.feature.geometry;
        if (!geom) continue;
        if (geom.type === 'Polygon' && pointInPolygon(point, geom.coordinates))
          return item.feature;
        if (
          geom.type === 'MultiPolygon' &&
          pointInMultiPolygon(point, geom.coordinates)
        )
          return item.feature;
      }
      return null;
    }

    async function updateHover(feature, screenPos) {
      const countryName = feature.name;
      const title = WIKI_TITLE_OVERRIDES[countryName] || countryName;
      // const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      //   title
      // )}`;
      const wikiUrl = '';
      console.error('Fetching data for:', title, wikiUrl);

      try {
        const [wiki, countries] = await Promise.allSettled([
          cachedJSON(wikiUrl),
        ]);

        let summary = '';
        let capital = '—';
        let flagUrl = null;
        if (wiki.status === 'fulfilled') {
          setStatus(`Loaded data for ${countryName}`);
          summary = wiki.value.extract;
          flagUrl = wiki.value.thumbnail?.source || null;
        }
        if (
          countries.status === 'fulfilled' &&
          Array.isArray(countries.value) &&
          countries.value[0]
        ) {
          capital = countries.value[0].capital?.[0] || '—';
          flagUrl =
            countries.value[0].flags?.svg ||
            countries.value[0].flags?.png ||
            null;
        }
        setHoverInfo({
          country: countryName,
          capital,
          flagUrl,
          summary,
          pos: screenPos,
        });
      } catch (e) {
        setHoverInfo({
          country: countryName,
          capital: '—',
          flagUrl: null,
          summary: '',
          pos: screenPos,
        });
      }
    }

    // TODO: Can i combine this with onMouseMove?
    function onClick(ev) {
      if (isDragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(globe, false);
      if (intersects.length) {
        const p = intersects[0].point.clone().normalize();
        const lat = 90 - (Math.acos(p.y) * 180) / Math.PI;
        let lon = (Math.atan2(p.z, -p.x) * 180) / Math.PI - 180;
        if (lon < -180) lon += 360;
        if (lon > 180) lon -= 360;
        const point = [lon, lat];

        const feature = hitCountry(point, stateRef.current.tree);
        if (feature) {
          handleGlobeClick(feature.name);
        }
      }
    }

    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMoveDrag);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onClick);

    let raf;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMoveDrag);
      // renderer.domElement.addEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // useEffect(() => {
  //   const el = tooltipRef.current;
  //   const mount = mountRef.current;
  //   if (!el || !mount) return;
  //   if (hoverInfo) {
  //     const pad = 12;
  //     const x = Math.min(
  //       Math.max(hoverInfo.pos.x + 14, pad),
  //       mount.clientWidth - 280
  //     );
  //     const y = Math.min(
  //       Math.max(hoverInfo.pos.y + 14, pad),
  //       mount.clientHeight - 180
  //     );
  //    el.style.transform = `translate(${x}px, ${y}px)`;
  //   }
  // }, [hoverInfo]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100vh',
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'hidden',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          padding: '6px 10px',
          borderRadius: '8px',
          fontSize: '12px',
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
        }}
      >
        {status}
      </div>

      {hoverInfo && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            maxWidth: '260px',
            top: '0px',
            left: '0px',
            transform: `translate(${hoverInfo.pos.x + 20}px, ${
              hoverInfo.pos.y
            }px)`,
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            background: 'rgba(255,255,255,0.95)',
            color: '#1e293b',
            padding: '10px',
            border: '1px solid #cbd5e1',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hoverInfo.flagUrl && (
              <img
                src={hoverInfo.flagUrl}
                alt="flag"
                style={{
                  width: '64px',
                  height: '40px',
                  objectFit: 'cover',
                  borderRadius: '2px',
                  border: '1px solid #ccc',
                }}
              />
            )}
            <div style={{ fontWeight: '600', lineHeight: '1.2' }}>
              {hoverInfo.country}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
            <span style={{ fontWeight: '500' }}>Capital:</span>{' '}
            {hoverInfo.capital}
          </div>
          {/* {hoverInfo.summary && (
            <div
              style={{
                fontSize: '12px',
                color: '#334155',
                marginTop: '6px',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 5,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {hoverInfo.summary}
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '10px', color: '#64748b' }}>
            Data: Wikipedia & REST Countries
          </div> */}
        </div>
      )}

      <>
        {/* <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            borderRadius: '8px',
          }}
        > */}
        {/* Quiz UI */}
        {/* Quiz Controls */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '10px',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            borderRadius: '12px',
            minWidth: 240,
          }}
        >
          {!quizMode ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Quiz</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.9, marginRight: 6 }}>
                  Type:
                </label>
                <select
                  value={quizType}
                  onChange={(e) => setQuizType(e.target.value)}
                >
                  <option value="flag">Flag</option>
                  <option value="capital">Capital</option>
                  <option value="name">Name</option>
                </select>
              </div>
              <button
                onClick={startQuiz}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Start Quiz
              </button>
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <div style={{ fontWeight: 700 }}>Quiz Running</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{elapsed}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.9, marginRight: 6 }}>
                  Type:
                </label>
                <select
                  value={quizType}
                  onChange={(e) => setQuizType(e.target.value)}
                >
                  <option value="flag">Flag</option>
                  <option value="capital">Capital</option>
                  <option value="name">Name</option>
                </select>
              </div>

              <div
                style={{
                  marginTop: 8,
                  background: 'rgba(255,255,255,0.08)',
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                {quizQuestion ? (
                  quizQuestion.type === 'flag' ? (
                    <img
                      src={quizQuestion.flag}
                      alt="flag"
                      style={{ width: 120 }}
                    />
                  ) : quizQuestion.type === 'capital' ? (
                    <div style={{ fontSize: 18, fontWeight: 600 }}>
                      {quizQuestion.capital}
                    </div>
                  ) : (
                    <div style={{ fontSize: 18, fontWeight: 600 }}>
                      {quizQuestion.country}
                    </div>
                  )
                ) : (
                  'Click Next Question'
                )}
              </div>

              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button
                  onClick={nextQuestion}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Next Question
                </button>
                <button
                  onClick={endQuiz}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  End Quiz
                </button>
              </div>

              {feedback && (
                <div
                  style={{
                    marginTop: 8,
                    fontWeight: 700,
                    color: feedback.includes('✅') ? 'lightgreen' : '#fca5a5',
                  }}
                >
                  {feedback}
                </div>
              )}

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.95 }}>
                <div>
                  Score: <b>{correctCount}</b> / <b>{totalCount}</b>
                </div>
                <div>
                  Accuracy: <b>{accuracy}%</b>
                </div>
              </div>
            </>
          )}
        </div>
        {/* </div> */}
        {/* <button
          onClick={nextQuestion}
          style={{
            position: 'absolute',
            top: 150,
            left: 10,
            padding: '6px 10px',
            borderRadius: '8px',
          }}
        >
          Next Question
        </button>

        {feedback && (
          <div
            style={{
              position: 'absolute',
              top: 200,
              left: 10,
              fontWeight: '600',
              color: feedback.includes('✅') ? 'lightgreen' : 'red',
            }}
          >
            {feedback}
          </div>
        )} */}
      </>
    </div>
  );
}
