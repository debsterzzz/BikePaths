// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);
// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZGVic3Rlcnp6eiIsImEiOiJjbWh6bG0zZ2QwbXB4MmxvbXIwYjFsdDVjIn0.sgktxgtMW3K5gz86SJ-oVA';

// ------------------------------------------------------------
// Global helper functions
// ------------------------------------------------------------

// Convert minutes -> human readable time (HH:MM AM/PM)
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString("en-US", { timeStyle: "short" });
}

// Minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Efficient GPU-friendly time filtering (using buckets)
function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) return tripsByMinute.flat();

  let min = (minute - 60 + 1440) % 1440;
  let max = (minute + 60) % 1440;

  if (min > max) {
    return tripsByMinute.slice(min).concat(tripsByMinute.slice(0, max)).flat();
  } else {
    return tripsByMinute.slice(min, max).flat();
  }
}

// Compute arrivals, departures, totals
function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map((station) => {
    let id = station.short_name;

    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;

    return station;
  });
}

// ------------------------------------------------------------
// Preallocate time buckets
// ------------------------------------------------------------
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);


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
  const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.getElementById("map").appendChild(svgNode);
  const svg = d3.select(svgNode);

  // ------------------------------------------------------------
  // Load Bluebikes stations JSON
  // ------------------------------------------------------------
const stationsJSON = await d3.json(
    "https://dsc106.com/labs/lab07/data/bluebikes-stations.json"
  );
  let stations = stationsJSON.data.stations;
  window.stations = stations;   // expose stations globally

  // ------------------------------------------------------------
  // Load & parse trips (convert dates + bucket)
  // ------------------------------------------------------------
  const trips = await d3.csv(
    "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv",
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);

      const sm = minutesSinceMidnight(trip.started_at);
      const em = minutesSinceMidnight(trip.ended_at);

      departuresByMinute[sm].push(trip);
      arrivalsByMinute[em].push(trip);

      return trip;
    }
  );

  // ------------------------------------------------------------
  // Initial traffic computation
  // ------------------------------------------------------------
  stations = computeStationTraffic(stations);

  let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
  // ------------------------------------------------------------
  // Step 4.3 — Scale stations by total traffic using sqrt scale
  // ------------------------------------------------------------
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // Append circles to the SVG for each station
  let circles = svg
  .selectAll('circle')
  .data(stations, (d) => d.short_name)
  .enter()
  .append('circle')
  .attr('fill', 'steelblue') // Circle fill color
  .attr('stroke', 'white') // Circle border color
  .attr('stroke-width', 1.2) // Circle border thickness
  .attr('fill-opacity', 0.6) // Circle opacity
  .attr("pointer-events", "auto") // override SVG-wide pointer-events:none
  .style('==departure-ratio', d => stationFlow(d.departures / d.totalTraffic),)
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

  // Reposition markers on map interactions
    map.on('move', updatePositions); // Update during map movement
    map.on('zoom', updatePositions); // Update during zooming
    map.on('resize', updatePositions); // Update on window resize
    map.on('moveend', updatePositions); // Final adjustment after movement ends
  
    updatePositions();
  // ------------------------------------------------------------
  // Step 5.2 — UI reactivity (slider)
  // ------------------------------------------------------------
  const timeSlider = document.getElementById("time-slider");
  const selectedTime = document.getElementById("time-readout");
  const anyTimeLabel = document.getElementById("any-time");

  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = "";
      anyTimeLabel.style.display = "block";
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = "none";
    }

    updateScatterPlot(timeFilter);
  
  }

  timeSlider.addEventListener("input", updateTimeDisplay);
  updateTimeDisplay();


   
  // ------------------------------------------------------------
  // Step 5.3 — Update Scatter Plot
  // ------------------------------------------------------------
  function updateScatterPlot(timeFilter) {
  // 1. Recompute based on time filter
  const filteredStations = computeStationTraffic(stations, timeFilter);

  // 2. Dynamic radius range
  timeFilter === -1
    ? radiusScale.range([0, 25])
    : radiusScale.range([3, 50]);

  // 3. Bind updated data
  circles = circles
    .data(filteredStations, (d) => d.short_name)
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("fill", "steelblue")
          .attr("fill-opacity", 0.6)
          .attr("stroke", "white")
          .attr("stroke-width", 1.2)
          .each(function (d) {
            // FIX: append title if missing
            let t = d3.select(this).select("title");
            if (t.empty()) {
              t = d3.select(this).append("title");
            }
            t.text(
              `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
            );
          }),

      (update) =>
        update.each(function (d) {
          // Update tooltip text
          d3.select(this)
            .select("title")
            .text(
              `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
            );
        }),

      (exit) => exit.remove()
    );

  // 4. Update radius + position
  circles
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .attr("cx", (d) => getCoords(d).cx)
    .attr("cy", (d) => getCoords(d).cy)
    .style('--departure-ratio', (d) =>
      stationFlow(d.departures / d.totalTraffic),
    );
  }
});
