// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);
// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZGVic3Rlcnp6eiIsImEiOiJjbWh6bG0zZ2QwbXB4MmxvbXIwYjFsdDVjIn0.sgktxgtMW3K5gz86SJ-oVA';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.07352, 42.36421], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

map.on('load', async () => {
  //code
  map.addSource('boston_route', {
  type: 'geojson',
  data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
  id: 'bbike-lanes',
  type: 'line',
  source: 'boston_route',
  paint: {
  'line-color': 'rgba(82, 90, 104, 1)',  // A bright green using hex code
  'line-width': 5,          // Thicker lines
  'line-opacity': 0.6       // Slightly less transparent
  },
  });

  map.addSource('cambridge_route', {
  type: 'geojson',
  data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
  id: 'cbike-lanes',
  type: 'line',
  source: 'cambridge_route',
  paint: {
  'line-color': 'rgba(82, 90, 104, 1)',  // A bright green using hex code
  'line-width': 5,          // Thicker lines
  'line-opacity': 0.6       // Slightly less transparent
  },
  });

  // 3. Add SVG overlay (IMPORTANT!)
  //
  const container = document.getElementById("map");
  const svgNode = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  container.appendChild(svgNode);

  const svg = d3.select(svgNode);

  // ------------------------------------------------------------
  // Load Bluebikes stations JSON
  // ------------------------------------------------------------
  let stationsData;
  try {
    stationsData = await d3.json(
      "https://dsc106.com/labs/lab07/data/bluebikes-stations.json"
    );
  } catch (err) {
    console.error("Error loading station JSON:", err);
    return;
  }

  let stations = stationsData.data.stations;

  // ------------------------------------------------------------
  // Step 4.1 — Load Bluebikes traffic CSV (March 2024)
  // ------------------------------------------------------------
  let trips;
  try {
    trips = await d3.csv(
      "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv"
    );
  } catch (err) {
    console.error("Traffic CSV failed:", err);
    return;
  }

  console.log("Loaded trips:", trips.length);

  // ------------------------------------------------------------
  // Step 4.2 — Compute arrivals + departures
  // ------------------------------------------------------------

  // departures by start station
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  // arrivals by end station
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  // add arrival/departure/totalTraffic to each station
  stations = stations.map((station) => {
    let id = station.short_name;

    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;

    return station;
  });

  console.log("Stations with traffic data:", stations);

  // ------------------------------------------------------------
  // Step 4.3 — Scale stations by total traffic using sqrt scale
  // ------------------------------------------------------------
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // Append circles to the SVG for each station
  const circles = svg
  .selectAll('circle')
  .data(stations)
  .enter()
  .append('circle')
  .attr('fill', 'steelblue') // Circle fill color
  .attr('stroke', 'white') // Circle border color
  .attr('stroke-width', 1.2) // Circle border thickness
  .attr('fill-opacity', 0.6) // Circle opacity
  .attr("pointer-events", "auto") // override SVG-wide pointer-events:none
  .each(function (d) {
      // add <title> tooltip
      d3.select(this)
        .append("title")
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    });
  // Function to update circle positions when the map moves/zooms
  function updatePositions() {
  circles
    .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
    .attr('cy', (d) => getCoords(d).cy) // Set the y-position using projected coordinates
    .attr("r", (d) => radiusScale(d.totalTraffic));
  
}

// Initial position update when map loads
  updatePositions();
  // Reposition markers on map interactions
    map.on('move', updatePositions); // Update during map movement
    map.on('zoom', updatePositions); // Update during zooming
    map.on('resize', updatePositions); // Update on window resize
    map.on('moveend', updatePositions); // Final adjustment after movement ends
});





