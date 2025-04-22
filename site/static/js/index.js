class UndergroundLine {
    constructor(id, json_source, name, serviceTypes) {
        this.id = id;
        this.json_source = json_source;
        this.name = name;
        this.serviceTypes = serviceTypes;

        this.stations = {};
        this.loaded = false;
    }
}

class UndergroundLine_Station {
    constructor(id, json_source, name, modes, stopType, placeType, lines, platforms, lat, lon, zone) {
        this.id = id;
        this.json_source = json_source;
        this.name = name.replace(" Underground Station", "");
        this.modes = modes;
        this.stopType = stopType;
        this.placeType = placeType;
        this.lines = lines;
        // this.platforms = platforms;
        this.current_query_platforms = [];
        this.lat = lat;
        this.lon = lon;
        this.zone = zone;

        this.loaded = true;
    }

    async getTimetable(line, platform_name) {
        if (!this.loaded) {console.warn("Station not loaded"); return; }
        if (!line.loaded) {console.warn("Line not loaded"); return;}

        let response = await TFL_API.get(`Line/${line.id}/Arrivals/${this.id}`);
        let arrivals = [];

        for (let arrival of response) {
            if (arrival.platformName === platform_name) {
                let destination = TFL_API.undergroundStations[arrival.destinationNaptan];

                arrivals.push(
                    new UndergroundLine_Arrival(
                        arrival.id,
                        arrival,
                        line,
                        this,
                        platform_name,
                        arrival.currentLocation,
                        destination,
                        arrival.towards,
                        arrival.timeToStation,
                        arrival.expectedArrival,
                        arrival.timing.read
                    )
                );
            }
        }

        arrivals.sort((a, b) => a.time_to_station - b.time_to_station);

        return arrivals;
    }

    async loadPlatforms(line) {
        this.loaded = false;

        let response = await TFL_API.get(`Line/${line.id}/Arrivals/${this.id}`);
        let platform_names = [];

        for (let arrival of response) {
            if (arrival.platformName !== null && !platform_names.includes(arrival.platformName)) {
                platform_names.push(arrival.platformName);
            }
        }
        
        this.current_query_platforms = platform_names;
        this.loaded = true;
    }
}


/**
 * Represents an arrival of an underground train on a specific line.
 * 
 * @class
 * @constructor
 * @param {string} id - The unique identifier for the arrival.
 * @param {Object} json_source - The JSON source object containing the arrival data, from the TFL API.
 * @param {UndergroundLine} line - The underground line.
 * @param {UndergroundLine_Station} station - The name of the station where the train is arriving.
 * @param {string} platform_name - The platform where the train will arrive.
 * @param {string} current_loc - Readable description of yhe current location of the train.
 * @param {string} destination - The destination of the train.
 * @param {string} towards - The terminus the train is heading towards.
 * @param {number} time_to_station - The time (in seconds) until the train arrives at the station.
 * @param {string|Date} expected - The expected arrival time of the train, as a string or Date object.
 */
class UndergroundLine_Arrival {
    constructor(id, json_source, line, station, platform, current_loc, destination, towards, time_to_station, expected, request_time) {
        this.id = id;
        this.json_source = json_source;
        this.line = line;
        this.station = station;
        this.platform = platform;
        this.current_loc = current_loc;
        this.destination = destination;
        this.towards = towards;
        this.time_to_station = time_to_station;
        this.expected = new Date(expected);
        this.request_time = new Date(request_time);

        this.loaded = true;
    }
}

/*
class UndergroundLine_Platform {
    constructor(id, json_source, name, number, line) {
        this.id = id;
        this.json_source = json_source;
        this.name = name;
        this.line = line;
        this.number = number;

        this.loaded = true;
    }
}
*/


const TFL_API = (function() {
    const base_url = "https://api.tfl.gov.uk/";
    const app_key = "aef507ce475644f8a5a64d5d64652bf1";

    var loaded = false;
    var undergroundLines = {};
    var undergroundStations = {};

    async function get(url, bypass) {
        if (!loaded && !bypass) {
            console.warn("TFL API Handler not loaded");
            return;
        }

        let content_type = "application/json";

        let response;
        let retryAfter = 10;

        while (true) {
            response = await fetch(
                `${base_url}${url}`, {
                    method: "GET",
                    headers: {
                        "Cache-Control": "no-cache",
                        "Content-Type": content_type,
                        "app_key": app_key,
                    }
                }
            );

            if (response.status === 429) {
                if (retryAfter > 200) {
                    console.error("Rate limit exceeded. Please try again later.");
                    return null;
                }

                console.warn(`Rate limit exceeded. Retrying after ${retryAfter} seconds...`);

                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                retryAfter *= 2;
            } else {
                break;
            }
        }

        return response.json();
    }


    async function load() {
        let underground_lines_json = await get(`Line/Mode/tube`, true);

        let stations_json = await get(`StopPoint/Type/NaptanMetroStation`, true);
        // let station_platforms_json = await get(`StopPoint/Type/NaptanMetroPlatform`);

        underground_lines_json.forEach(async (line) => {
            let services = line.serviceTypes.map((serviceType) => serviceType.name);
            undergroundLines[line.id] = new UndergroundLine(line.id, line, line.name, services);
        });

        await stations_json.forEach(async (station) => {
            let zone = null;
            let lines = station.lines.map(line => undergroundLines[line.id]).filter(line => line !== undefined);
            let platforms = [];

            for (let additionalProperty of station.additionalProperties) {
                if (additionalProperty.key === "Zone") {
                    zone = additionalProperty.value;
                }
            }

            /*
            for (let platform_index in station_platforms_json) {
                let platform  = station_platforms_json[platform_index];

                if (platform.stationNaptan === station.id) {
                    let platform_number = null

                    if (station.id.substring(3,5) === "GZ") {
                        platform_number = platform.id.substring(5).replace(station.id.substring(5), "");
                    }

                    platforms.push(
                        new UndergroundLine_Platform(
                            platform.id,
                            platform,
                            `Platform ${platform_number}`,
                            platform_number,
                            null,
                        )
                    );

                    station_platforms_json.splice(platform_index, 1);
                }
            }
            */

            undergroundStations[station.id] = new UndergroundLine_Station(
                station.id,
                station,
                station.commonName,
                station.modes,
                station.stopType,
                station.placeType,
                lines,
                platforms,
                station.lat,
                station.lon,
                zone
            );

            for (let line of lines) {
                line.stations[station.id] = undergroundStations[station.id];
            }
        });

        for (let line_id of Object.keys(undergroundLines)) {
            undergroundLines[line_id].loaded = true;
        }

        loaded = true;
        update_select_options();
    }
    
    load();

    return {
        loaded: loaded,
        undergroundLines: undergroundLines,
        undergroundStations: undergroundStations,
        get: get
    }
})();


const BoardDomHandler = (function(dom_line1, dom_line2, dom_line3, dom_line4) {
    var line = null, station = null, platform = null;
    var changed = true;
    var query_timeout = null;
    var last_query_time = null;

    var dom = {
        line1: {
            wrapper: dom_line1,
            left: dom_line1.find("> span:nth-child(1)"),
            right: dom_line1.find("> span:nth-child(2)"),
        },
        line2: {
            wrapper: dom_line2,
            left: dom_line2.find("> span:nth-child(1)"),
            right: dom_line2.find("> span:nth-child(2)"),
        },
        line3: {
            wrapper: dom_line3,
            left: dom_line3.find("> span:nth-child(1)"),
            right: dom_line3.find("> span:nth-child(2)"),
        },
        line4: {
            wrapper: dom_line4,
            center: dom_line4.find("> span:nth-child(1)"),
        },
    };

    function startClock() {
        setInterval(() => {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            dom.line4.center.html(`${hours}:${minutes}:<small>${seconds}</small>`);
        }, 500);
    }

    function clear() {
        dom.line1.left.html("<br>").removeClass("center");
        dom.line1.right.html("<br>");
        dom.line2.left.html("<br>").removeClass("center");
        dom.line2.right.html("<br>");
        dom.line3.left.html("<br>").removeClass("center");
        dom.line3.right.html("<br>");
    }

    function writeArrivalLine(arrival, index, line_number) {
        if (!arrival) return;

        let tts_text = arrival.time_to_station >= 30 ? `${Math.round(arrival.time_to_station / 60)} min` : "Due";

        if (arrival.current_loc === "At Platform") {
            tts_text = "Arrived";
        }

        dom[`line${line_number}`].left.text(`${index}  ${arrival.towards}`).removeClass("center");;
        dom[`line${line_number}`].right.text(tts_text);
    }

    function updateBoardText() {
        if (line && station && platform) {
            if (changed) {
                changed = false;
                clear();
    
                if (query_timeout) {
                    clearTimeout(query_timeout);
                    query_timeout = null;
                }
    
                let query_fn = async () => {
                    let arrivals = await station.getTimetable(line, platform);

                    if (arrivals.length === 0) {
                        clear();
                        dom.line1.left.text("No trains arriving");
                    }

                    if (last_query_time && arrivals[0].request_time <= last_query_time) {
                        console.warn("Query time is older than or same as previous query time. Skipping update.");
                        query_timeout = setTimeout(query_fn, 5 * 1000);
                        return;
                    }

                    last_query_time = arrivals[0].request_time;

                    writeArrivalLine(arrivals[0], 1, 1);
                    writeArrivalLine(arrivals[1], 2, 2);
                    writeArrivalLine(arrivals[2], 3, 3);
    
                    if (arrivals[0].time_to_station < 10) {
                        dom.line3.left.text("*** STAND BACK-TRAIN APPROACHING ***").addClass("center");
                        dom.line3.right.text("")
                    }
    
                    let next_query_time = Math.max(Math.min(
                        arrivals[0]?.time_to_station % 30 || 30,
                        arrivals[1]?.time_to_station % 30 || 30,
                        arrivals[2]?.time_to_station % 30 || 30,
                        30 // max of 30 seconds between requests
                    ), 5); // min of 5 seconds between requests

                    if ([NaN, undefined, null].includes(next_query_time)) {
                        next_query_time = 30;
                    }
    
                    if (next_query_time < 30) {
                        next_query_time = 10; // refreshes faster if a train is close
                    }

                    query_timeout = setTimeout(query_fn, next_query_time * 1000);
                };
    
                query_fn();
            }
    
        } else {
            clear();
        
            dom.line1.left.text("London Underground Departures Board");
        
            if (!line) {
                dom.line2.left.text("Select a line and station...");
                return;
            } else if (!station) {
                dom.line2.left.text(`Select a station on the ${line.name} line...`);
                return;
            } else if (!platform) {
                dom.line2.left.text("Select a platform...");
                return;
            }
        }
    }

    function setLine(val) {
        line = val;
        set_url_param("line", line ? line.id : null);
        
        setStation(null)
        changed = true;
    }
    
    function setStation(val) {
        station = val;
        set_url_param("station", station ? station.id : null);
        
        setPlatform(null);
        changed = true;
    }
    
    function setPlatform(val) {
        platform = val;
        set_url_param("platform", platform);
    
        changed = true;
    }    

    startClock();
    clear();

    return {
        getLine: () => line, 
        getStation: () => station, 
        getPlatform: () => platform,
        setLine: setLine,
        setStation: setStation,
        setPlatform: setPlatform,
        updateBoardText: updateBoardText,
    }

})($(".board-wrapper .board-line-1"), $(".board-wrapper .board-line-2"), $(".board-wrapper .board-line-3"), $(".board-wrapper .board-line-4"));


// #region Option Select handling


const reset_select = (select, itemname, populate_items = null, filters = []) => {
    select.empty();

    select.append(
        $(`<option />`).attr("value", "").text(`Select a ${itemname}...`)
    );

    if (populate_items) {
        for (let object_id of Object.keys(populate_items)) {
            let object = populate_items[object_id];

            let valid = true;
            
            for (let filter of filters) {
                if (!filter(object)) {
                    valid = false;
                    break;
                }
            }

            if (!valid) {
                continue;
            }

            select.append(
                $(`<option />`).attr("value", object_id).text(object.name)
            );
        }
    }
}


const reset_select_platform = async () => {
    options_platform_select.empty();

    let text = "";

    if (BoardDomHandler.getLine() === null || BoardDomHandler.getStation() === null) {
        text = "Select a line and station first";

        if (BoardDomHandler.getLine() !== null) {
            text = "Select a station first";
        }

        options_platform_select.append(
            $(`<option />`).attr("value", "").text(text)
        );
    } else {
        options_platform_select.append(
            $(`<option />`).attr("value", "").text(`Loading platforms...`)
        );

        await BoardDomHandler.getStation().loadPlatforms(BoardDomHandler.getLine());

        options_platform_select.empty();

        options_platform_select.append(
            $(`<option />`).attr("value", "").text(`Select a platform...`)
        );
        
        for (let platform of BoardDomHandler.getStation().current_query_platforms) {
            options_platform_select.append(
                $(`<option />`).attr("value", platform).text(platform)
            );
        }
    }
}


const update_select_options = () => {
    reset_select(options_line_select, "line", TFL_API.undergroundLines);
    reset_select(options_station_select, "station", TFL_API.undergroundStations);
    reset_select_platform();
}


const on_select_change_line = () => {
    let line_id = options_line_select.val();

    if (line_id === "") {
        BoardDomHandler.setLine(null);
        BoardDomHandler.updateBoardText();

        reset_select(options_station_select, "station", TFL_API.undergroundStations);
        reset_select_platform();
        return;
    }

    BoardDomHandler.setLine(TFL_API.undergroundLines[line_id]);
    BoardDomHandler.updateBoardText();

    reset_select(
        options_station_select, 
        "station", 
        TFL_API.undergroundStations,
        [station => { return station.lines.some(line => line.id === line_id); }]
    );

    reset_select_platform();
}


const on_select_change_station = () => {
    let station_id = options_station_select.val();

    if (station_id === "") {
        BoardDomHandler.setStation(null);
        BoardDomHandler.updateBoardText();

        reset_select_platform();
        return;
    }

    BoardDomHandler.setStation(TFL_API.undergroundStations[station_id]);
    BoardDomHandler.updateBoardText();
    
    reset_select_platform();
}


const on_select_change_platform = () => {
    let platform = options_platform_select.val();

    if (platform === "") {
        BoardDomHandler.setPlatform(null);
        BoardDomHandler.updateBoardText();

        return;
    }

    BoardDomHandler.setPlatform(platform);
    BoardDomHandler.updateBoardText();
}

// #endregion


const set_url_param = (key, value) => {
    url_paramaters[key] = value;

    let as_string = "?"

    for (let [key, value] of Object.entries(url_paramaters)) {
        if (value !== null && value !== "") {
            if (as_string !== "?") {
                as_string += "&";
            }
            as_string += `${key}=${value}`;
        }   
    }

    window.history.replaceState({}, "", as_string);
}


const options_wrapper = $(".options-wrapper"),
      options_line_select = options_wrapper.find("#option_line_select"),
      options_station_select = options_wrapper.find("#option_station_select"),
      options_platform_select = options_wrapper.find("#option_platform_select");


const url_paramaters = {};

for (let [key, value] of new URLSearchParams(window.location.search).entries()) {
    url_paramaters[key] = value
}


$(window).on("load", async () => {
    options_line_select.on("change", on_select_change_line);
    options_station_select.on("change", on_select_change_station);
    options_platform_select.on("change", on_select_change_platform);

    BoardDomHandler.updateBoardText();

    while (!TFL_API.loaded) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    let line_id = url_paramaters.line;
    let station_id = url_paramaters.station;
    let platform_name = url_paramaters.platform;

    if (line_id && TFL_API.undergroundLines[line_id]) {
        BoardDomHandler.setLine(TFL_API.undergroundLines[line_id]);
        options_line_select.val(line_id);
        on_select_change_line();

        if (station_id && TFL_API.undergroundStations[station_id]) {
            BoardDomHandler.setStation(TFL_API.undergroundStations[station_id]);
            options_station_select.val(station_id);
            on_select_change_station();

            if (platform_name) {
                await reset_select_platform();
                
                if (BoardDomHandler.getStation().current_query_platforms.includes(platform_name)) {
                    BoardDomHandler.setPlatform(platform_name);
                    options_platform_select.val(platform_name);
                    on_select_change_platform();
                }
            }
        }
    }
});
