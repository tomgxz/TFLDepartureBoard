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
        this.name = name;
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

        let response = await TFL_API_Handler.shared.get(`Line/${line.id}/Arrivals/${this.id}`);
        let arrivals = [];

        for (let arrival of response) {
            if (arrival.platformName === platform_name) {
                let destination = TFL_API_Handler.shared.undergroundStations[arrival.destinationNaptan];

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
                        arrival.expectedArrival
                    )
                );
            }
        }

        arrivals.sort((a, b) => a.time_to_station - b.time_to_station);

        return arrivals;
    }

    async loadPlatforms(line) {
        this.loaded = false;

        let response = await TFL_API_Handler.shared.get(`Line/${line.id}/Arrivals/${this.id}`);
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
    constructor(id, json_source, line, station, platform, current_loc, destination, towards, time_to_station, expected) {
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


class TFL_API_Handler {
    static shared = new TFL_API_Handler();

    constructor() {
        this.base_url = "https://api.tfl.gov.uk";
        this.app_key = "aef507ce475644f8a5a64d5d64652bf1";
        this.loaded = false;

        this.load();
    }
    
    async get(url, type = "json") {
        let content_type = "application/json";

        if (type === "xml") {
            content_type = "";
        }

        let response;
        let retryAfter = 10;

        while (true) {
            response = await fetch(
                `${this.base_url}/${url}`, {
                    method: "GET",
                    headers: {
                        "Cache-Control": "no-cache",
                        "Content-Type": content_type,
                        "app_key": this.app_key,
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

        if (type === "xml") {
            let text = await response.text();
            let parser = new DOMParser();
            let xmlDoc = parser.parseFromString(text, "text/xml");
            return xmlDoc;
        }

        return response.json();
    }

    async load() {
        this.undergroundLines = {};
        this.undergroundStations = {};

        let underground_lines_json = await this.get(`Line/Mode/tube`);

        let stations_json = await this.get(`StopPoint/Type/NaptanMetroStation`);
        // let station_platforms_json = await this.get(`StopPoint/Type/NaptanMetroPlatform`);

        underground_lines_json.forEach(async (line) => {
            let services = line.serviceTypes.map((serviceType) => serviceType.name);
            this.undergroundLines[line.id] = new UndergroundLine(line.id, line, line.name, services);
        });

        await stations_json.forEach(async (station) => {
            let zone = null;
            let lines = station.lines.map(line => this.undergroundLines[line.id]).filter(line => line !== undefined);
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

            this.undergroundStations[station.id] = new UndergroundLine_Station(
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
                line.stations[station.id] = this.undergroundStations[station.id];
            }
        });

        for (let line_id of Object.keys(this.undergroundLines)) {
            this.undergroundLines[line_id].loaded = true;
        }

        update_select_options();
        this.loaded = true;
    }
}


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

    if (selected_line === null || selected_station === null) {
        text = "Select a line and station first";

        if (selected_line !== null) {
            text = "Select a station first";
        }

        options_platform_select.append(
            $(`<option />`).attr("value", "").text(text)
        );
    } else {
        options_platform_select.append(
            $(`<option />`).attr("value", "").text(`Loading platforms...`)
        );

        await selected_station.loadPlatforms(selected_line);

        options_platform_select.empty();

        options_platform_select.append(
            $(`<option />`).attr("value", "").text(`Select a platform...`)
        );
        
        for (let platform of selected_station.current_query_platforms) {
            options_platform_select.append(
                $(`<option />`).attr("value", platform).text(platform)
            );
        }
    }
}


const update_select_options = () => {
    reset_select(options_line_select, "line", TFL_API_Handler.shared.undergroundLines);
    reset_select(options_station_select, "station", TFL_API_Handler.shared.undergroundStations);
    reset_select_platform();
}


const on_select_change_line = () => {
    let line_id = options_line_select.val();

    if (line_id === "") {
        set_line(null);
        update_board_text();

        reset_select(options_station_select, "station", TFL_API_Handler.shared.undergroundStations);
        reset_select_platform();
        return;
    }

    set_line(TFL_API_Handler.shared.undergroundLines[line_id]);
    update_board_text();

    reset_select(
        options_station_select, 
        "station", 
        TFL_API_Handler.shared.undergroundStations,
        [station => { return station.lines.some(line => line.id === line_id); }]
    );

    reset_select_platform();
}


const on_select_change_station = () => {
    let station_id = options_station_select.val();

    if (station_id === "") {
        set_station(null);
        update_board_text();

        reset_select_platform();
        return;
    }

    set_station(TFL_API_Handler.shared.undergroundStations[station_id]);
    update_board_text();
    
    reset_select_platform();
}


const on_select_change_platform = () => {
    let platform = options_platform_select.val();

    if (platform === "") {
        set_platform(null);
        update_board_text();

        return;
    }

    set_platform(platform);
    update_board_text();
}


const set_line = line => {
    selected_line = line;
    set_url_param("line", line ? line.id : null);

    selected_station = null;
    set_url_param("station", null);

    selected_platform = null;
    set_url_param("platform", null);

    changed_since_last_query = true;
}

const set_station = station => {
    selected_station = station;
    set_url_param("station", station ? station.id : null);

    selected_platform = null;
    set_url_param("platform", null);

    changed_since_last_query = true;
}

const set_platform = platform => {
    selected_platform = platform;
    set_url_param("platform", platform);

    changed_since_last_query = true;
}

// #endregion


// #region Board text handling

const clear_board_text = () => {
    board_line_1_left.html("<br>");
    board_line_1_right.html("<br>");
    board_line_2_left.html("<br>");
    board_line_2_right.html("<br>");
}


const update_board_text = () => {
    if (selected_line && selected_station && selected_platform) {
        if (changed_since_last_query) {
            changed_since_last_query = false;

            if (arrival_query_timeout) {
                clearTimeout(arrival_query_timeout);
                arrival_query_timeout = null;
            }

            let query_fn = async () => {
            let arrivals = await selected_station.getTimetable(selected_line, selected_platform);

                if (arrivals.length === 0) {
                    clear_board_text();
                    board_line_1_left.text("No trains arriving");
                }

                const write = (arrival, index, left_node, right_node) => {
                    if (!arrival) return;

                    let tts_text = arrival.time_to_station > 60 ? `${Math.floor(arrival.time_to_station / 60)} min` : "Due";

                    left_node.text(`${index}  ${arrival.towards}`);
                    right_node.text(tts_text);
                }

                write(arrivals[0], 1, board_line_1_left, board_line_1_right);
                write(arrivals[1], 2, board_line_2_left, board_line_2_right);

                let next_query_time = Math.max(Math.min(
                    arrivals[0]?.time_to_station % 30 || 30, 
                    arrivals[1]?.time_to_station % 30 || 30, 
                    30 // max of 30 seconds between requests
                ), 5); // min of 5 seconds between requests

                if ([NaN, undefined, null].includes(next_query_time)) {
                    next_query_time = 30;
                }

                arrival_query_timeout = setTimeout(query_fn, next_query_time * 1000);
            };

            query_fn();
        }

    } else {
        clear_board_text();
    
        board_line_1_left.text("London Underground Departures Board");
    
        if (!selected_line) {
            board_line_2_left.text("Select a line and station...");
            return;
        } else if (!selected_station) {
            board_line_2_left.text(`Select a station on the ${selected_line.name} line...`);
            return;
        } else if (!selected_platform) {
            board_line_2_left.text("Select a platform...");
            return;
        }
    }
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
      options_platform_select = options_wrapper.find("#option_platform_select"),
      
      board_wrapper = $(".board-wrapper"),
      board_line_1 = board_wrapper.find(".board-line-1"),
      board_line_2 = board_wrapper.find(".board-line-2"),
      board_line_3 = board_wrapper.find(".board-line-3"),
      
      board_line_1_left = board_line_1.find("> span:nth-child(1)"),
      board_line_1_right = board_line_1.find("> span:nth-child(2)"),
      board_line_2_left = board_line_2.find("> span:nth-child(1)"),
      board_line_2_right = board_line_2.find("> span:nth-child(2)");

const url_paramaters = {};

for (let [key, value] of new URLSearchParams(window.location.search).entries()) {
    url_paramaters[key] = value
}

let selected_line = null, 
    selected_station = null, 
    selected_platform = null,
    arrival_query_timeout = null,
    changed_since_last_query = false;


$(window).on("load", async () => {
    options_line_select.on("change", on_select_change_line);
    options_station_select.on("change", on_select_change_station);
    options_platform_select.on("change", on_select_change_platform);

    setInterval(() => {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        board_line_3.html(`${hours}:${minutes}:<small>${seconds}</small>`);
    }, 500);

    update_board_text();

    while (!TFL_API_Handler.shared.loaded) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    let line_id = url_paramaters.line;
    let station_id = url_paramaters.station;
    let platform_id = url_paramaters.platform;

    if (line_id && TFL_API_Handler.shared.undergroundLines[line_id]) {
        selected_line = TFL_API_Handler.shared.undergroundLines[line_id];
        options_line_select.val(line_id);
        on_select_change_line();

        if (station_id && TFL_API_Handler.shared.undergroundStations[station_id]) {
            selected_station = TFL_API_Handler.shared.undergroundStations[station_id];
            options_station_select.val(station_id);
            on_select_change_station();

            if (platform_id) {
                await reset_select_platform();
                
                if (selected_station.current_query_platforms.includes(platform_id)) {
                    selected_platform = platform_id;
                    options_platform_select.val(platform_id);
                    on_select_change_platform();
                }
            }
        }
    }
});
