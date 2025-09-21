import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import RBush from 'rbush';
import './App.css';

import countryMeta from './countries-map.json';
import QuizMenu from './QuizMenu.jsx';
import {
  BORDER_LINE_COLOR,
  FULL_BRIGHTNESS,
  WIKI_TITLE_OVERRIDES,
  BACKGROUND_COLOR,
} from './constants.js';

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
  const [highResTextures, setHighResTextures] = useState(false);
  const stateRef = useRef({ features: [] });
  const quizRef = useRef(null);

  // Effect to update textures when highResTextures changes
  useEffect(() => {
    stateRef.current.highResTextures = highResTextures;
    if (stateRef.current.reloadTextures) {
      stateRef.current.reloadTextures();
    }
  }, [highResTextures]);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND_COLOR);

    // const cube = new THREE.Mesh(
    //   new THREE.BoxGeometry(1, 1, 1),
    //   new THREE.MeshNormalMaterial()
    // );
    // scene.add(cube);

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.minDistance = 2.2;
    controls.maxDistance = 8;
    // controls.target.set(0, 1, 0); // This makes globe appear lower

    // TODO: TESTING FOR MOBILE
    controls.panSpeed = 0.5;

    // Function to move camera to a specific country
    const moveCameraToCountry = (lat, lon) => {
      const targetPosition = lonLatToVec3(lon, lat, 4.5);
      const currentPosition = camera.position.clone();

      // Animate camera movement
      const duration = 2000; // 2 seconds
      const startTime = Date.now();

      controls.enabled = false;

      const animateCamera = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth movement
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        camera.position.lerpVectors(
          currentPosition,
          targetPosition,
          easeProgress
        );

        // Keep the target at the center of the globe
        controls.target.set(0, 0, 0);

        if (progress < 1) {
          requestAnimationFrame(animateCamera);
        } else {
          controls.enabled = true;
        }
      };

      animateCamera();
    };

    stateRef.current.moveCameraToCountry = moveCameraToCountry;

    scene.add(new THREE.AmbientLight(FULL_BRIGHTNESS, 0.6));
    const dir = new THREE.DirectionalLight(FULL_BRIGHTNESS, 1.0);
    dir.position.set(-5, 3, 1);
    scene.add(dir);

    const group = new THREE.Group();
    scene.add(group);
    const R = 2;

    const sphereGeo = new THREE.SphereGeometry(R, 96, 96);
    const texLoader = new THREE.TextureLoader();
    const earthTexUrl = highResTextures
      ? '/21k_earth_daymap.png'
      : '/8k_earth_daymap.jpg';
    const bumpUrl = '/8k_earth_normal_map.jpg';
    const specUrl = '/8k_earth_specular_map.jpg';

    const material = new THREE.MeshPhongMaterial({ color: 0xffffff });

    const loadTextures = () => {
      // const currentEarthTexUrl = stateRef.current.highResTextures
      //   ? '/21k_earth_daymap.png'
      //   : '/8k_earth_daymap.jpg';
      const currentEarthTexUrl = '/8k_earth_daymap.jpg';
      Promise.all([
        new Promise((res) => texLoader.load(currentEarthTexUrl, res)),
        // new Promise((res) => texLoader.load(bumpUrl, res)),
        // new Promise((res) => texLoader.load(specUrl, res)),
      ]).then(([map, bumpMap, specMap]) => {
        map.anisotropy = 8;
        material.map = map;
        material.bumpMap = bumpMap;
        material.bumpScale = 0.03;
        material.specularMap = specMap;
        material.shininess = 8;
        material.needsUpdate = true;
      });
    };

    // Initial texture load
    loadTextures();
    stateRef.current.reloadTextures = loadTextures;
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
        vertexColors: true,
      });

      // This lets us map country names to materials
      // so we can highlight them later
      const countryLines = {}; // store country name -> array of line objects
      const segments = [];
      const colors = [];
      const defaultColor = new THREE.Color(BORDER_LINE_COLOR);

      const addRing = (ring) => {
        for (let i = 0; i < ring.length - 1; i++) {
          const [lon1, lat1] = ring[i];
          const [lon2, lat2] = ring[i + 1];

          const v1 = lonLatToVec3(lon1, lat1, R * 1.002);
          const v2 = lonLatToVec3(lon2, lat2, R * 1.002);

          segments.push(v1.x, v1.y, v1.z);
          segments.push(v2.x, v2.y, v2.z);

          // push default color twice (for both vertices)
          colors.push(defaultColor.r, defaultColor.g, defaultColor.b);
          colors.push(defaultColor.r, defaultColor.g, defaultColor.b);
        }
      };

      let vertexOffset = 0;
      for (const f of features) {
        const geom = f.geometry;
        if (!geom) continue;

        const name =
          f.properties.ADMIN ||
          f.properties.NAME ||
          f.properties.name ||
          'Unknown';

        const coords = geom.coordinates;
        const type = geom.type;

        const start = vertexOffset; // record start of this country’s data

        if (type === 'Polygon') {
          for (const ring of coords) {
            addRing(ring);
            vertexOffset += (ring.length - 1) * 2; // two vertices per segment
          }
        } else if (type === 'MultiPolygon') {
          for (const poly of coords) {
            for (const ring of poly) {
              addRing(ring);
              vertexOffset += (ring.length - 1) * 2;
            }
          }
        }

        const count = vertexOffset - start;
        countryLines[name] = { start, count };
      }

      // Build merged geometry
      // These borders are by far the most performance-intensive part
      // Merging them should have no visual impact but makes rendering 100x faster
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mergedLines = new THREE.LineSegments(g, lineMat);
      bordersGroup.add(mergedLines);

      // For highlighting, we need to create a separate group thats overlaid ontop
      const highlightGroup = new THREE.Group();
      highlightGroup.renderOrder = 999; // render last
      group.add(highlightGroup);
      stateRef.current.highlightGroup = highlightGroup;

      stateRef.current.countryLines = countryLines;
      stateRef.current.bordersGeometry = g;
      stateRef.current.bordersMesh = mergedLines;

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

      // Create country labels
      const labelsGroup = new THREE.Group();
      group.add(labelsGroup);
      stateRef.current.labelsGroup = labelsGroup;

      setStatus('Ready');
    };

    fetchBorders().catch((e) => console.error(`Error: ${e.message}`));

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
      // Dont show hover info when in quiz mode
      if (quizRef.current && quizRef.current.quizMode) return;

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
          const meta = countryMeta[feature.name] || {};
          const tooltipWidth = 260;
          const tooltipHeight = 80;
          const padding = 20;

          // Calculate position with boundary detection
          let x = ev.clientX - rect.left + padding;
          let y = ev.clientY - rect.top;

          // Check right boundary
          if (x + tooltipWidth > rect.width) {
            x = ev.clientX - rect.left - tooltipWidth - padding;
          }

          // Check bottom boundary
          if (y + tooltipHeight > rect.height) {
            y = ev.clientY - rect.top - tooltipHeight - padding;
          }

          // Ensure tooltip doesn't go off the left or top
          x = Math.max(padding, x);
          y = Math.max(padding, y);

          setHoverInfo({
            country: meta.name || feature.name,
            capital: meta.capital || '—',
            flagUrl: meta.flag || null,
            pos: { x, y },
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
          quizRef.current.handleGlobeClick(feature.name);
        }
      }
    }

    /* Mobile Stuff */
    let touchStartPos = { x: 0, y: 0 };
    // Touch start
    function onTouchStart(ev) {
      const touch = ev.touches[0];
      touchStartPos = { x: touch.clientX, y: touch.clientY };
      isDragging = false;
    }
    // Touch move
    function onTouchMove(ev) {
      const touch = ev.touches[0];
      if (
        Math.abs(touch.clientX - touchStartPos.x) > 2 ||
        Math.abs(touch.clientY - touchStartPos.y) > 2
      ) {
        isDragging = true;
      }
    }
    // Touch end
    function onTouchEnd(ev) {
      if (!isDragging) {
        onMouseMove(ev); // your click handler
      }
    }
    renderer.domElement.addEventListener('touchstart', onTouchStart, false);
    renderer.domElement.addEventListener('touchmove', onTouchMove, false);
    renderer.domElement.addEventListener('touchend', onTouchEnd, false);

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

      {hoverInfo && (
        <div
          ref={tooltipRef}
          className="hover-info"
          style={{
            top: `${hoverInfo.pos.y}px`,
            left: `${hoverInfo.pos.x}px`,
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

      {/* Quiz UI */}
      <QuizMenu countryMeta={countryMeta} stateRef={stateRef} ref={quizRef} />

      {/* Globe Controls */}
      {/* TODO: Find a better way to load high-res textures, then reenable this */}
      {/* <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          padding: '10px',
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          borderRadius: '12px',
          minWidth: 200,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Globe Options</div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={highResTextures}
            onChange={(e) => setHighResTextures(e.target.checked)}
          />
          High-Res Textures
        </label>
      </div> */}
    </div>
  );
}
