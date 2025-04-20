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
        this.platforms = platforms;
        this.lat = lat;
        this.lon = lon;
        this.zone = zone;

        this.loaded = true;
    }

    async getTimetable(direction) {
        if (!this.loaded) {
            throw new Error("Station not loaded");
        }

        for (let line of this.lines) {
            if (!line.loaded) {
                throw new Error("Line not loaded");
            }

            let line_response = await TFL_API_Handler.shared.get(`Line/${line.id}/Arrivals/${this.id}`);

            for (let arrival of line_response) {
                //console.log(`${arrival.lineName} Line: ${arrival.platformName} expected in ${arrival.timeToStation} seconds, heading towards ${arrival.towards}`);
            }
        }
    }
}

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

        const response = await fetch(
            `${this.base_url}/${url}`, {
                method: "GET",
                headers: {
                    "Cache-Control": "no-cache",
                    "Content-Type": content_type,
                    "app_key": this.app_key,
                }
            }
        );

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
        let station_platforms_json = await this.get(`StopPoint/Type/NaptanMetroPlatform`);

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
                            `Platform ${platform_number}`, // TODO
                            platform_number,
                            null,
                        )
                    );

                    station_platforms_json.splice(platform_index, 1);
                }
            }

            console.log(platforms)

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

        this.loaded = true;
        update_select_options();
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


const reset_select_platform = () => {
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
            $(`<option />`).attr("value", "").text(`Select a platform...`)
        );
        
        for (let platform of selected_station.platforms) {
            options_platform_select.append(
                $(`<option />`).attr("value", platform.id).text(platform.name)
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
        selected_line = null;
        reset_select(options_station_select, "station", TFL_API_Handler.shared.undergroundStations);
        reset_select_platform();
        return;
    }

    selected_line = TFL_API_Handler.shared.undergroundLines[line_id];
    selected_station = null;
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
        selected_station = null;
        reset_select_platform();
        return;
    }

    selected_station = TFL_API_Handler.shared.undergroundStations[station_id];
    update_board_text();
    
    reset_select_platform();
}


const on_select_change_platform = () => {
    let platform_id = options_platform_select.val();

    selected_platform = selected_station.platforms.find(platform => platform.id === platform_id);

    if (platform_id === "" || selected_platform === undefined) {
        selected_platform = null;
        return;
    }

    update_board_text();
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
    
    clear_board_text();

    board_line_1_left.text("Loading data...");
}

// #endregion


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

let selected_line = null, selected_station = null, selected_platform = null;


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

    debug_station = TFL_API_Handler.shared.undergroundStations["940GZZLULNB"]; // london bridge
    await debug_station.getTimetable("outbound")

    // stop_data = await TFL_API_Handler.shared.get("jp_public/api10/XML_STOPSTRUCTURE_REQUEST?sSStopNr=940GZZLUSJP", type="xml");
    // stop_data = stop_data.getElementsByTagName("itdStopStructureRequest")[0];
})

