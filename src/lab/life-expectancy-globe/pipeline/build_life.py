"""Writes data/life.json from the table transcribed off Visual Capitalist's
"The Life Expectancy of Every Country" (UN World Population Prospects 2024,
2026 medium projection; gain is against the 1950 estimate).

Row: name | 2026 life expectancy | gain since 1950 | map key
Map key is the world-atlas 50m country name when it differs from the table's
name, or "lat,lon" for places that have no polygon of their own in that file.
"""
import json, pathlib

ROWS = """
Monaco|86.7|18.7
San Marino|86.0|14.4
Hong Kong SAR|85.9|28.1|Hong Kong
Japan|85.1|25.9
South Korea|84.6|62.4
Saint Barthélemy|84.6|30.7|St-Barthélemy
Andorra|84.5|17.3
French Polynesia|84.4|32.6|Fr. Polynesia
Switzerland|84.4|15.5
Australia|84.3|15.3
Italy|84.2|18.5
Singapore|84.1|30.0
Spain|84.1|22.3
Liechtenstein|84.1|18.7
Réunion|83.9|36.4|-21.1,55.5
Gibraltar|83.9|18.8|36.14,-5.35
Malta|83.8|20.3
Norway|83.8|12.2
Sweden|83.7|12.6
France|83.7|17.3
Guernsey|83.7|12.4
Macao SAR|83.6|25.3|Macao
Holy See|83.4|17.6|Vatican
United Arab Emirates|83.4|41.2
Iceland|83.3|12.3
Canada|83.1|14.8
Martinique|83.0|28.1|14.64,-61.0
Ireland|82.9|17.3
Israel|82.9|13.0
Portugal|82.9|24.4
Qatar|82.8|32.1
Bermuda|82.8|22.5
Luxembourg|82.6|17.1
Netherlands|82.6|11.2
Belgium|82.6|16.3
Guadeloupe|82.6|29.5|16.25,-61.55
New Zealand|82.5|13.3
Austria|82.5|17.6
Finland|82.4|18.2
Greece|82.4|16.2
Denmark|82.4|12.1
Puerto Rico|82.3|21.9
Cyprus|82.2|26.3
Slovenia|82.1|20.3
Germany|81.9|15.1
United Kingdom|81.7|13.1
Bahrain|81.7|43.1
Maldives|81.7|45.2
Chile|81.7|28.6
Isle of Man|81.4|18.3
Costa Rica|81.4|23.9
Taiwan|81.1|24.5
Kuwait|81.0|31.2
Cayman Islands|80.9|26.9|Cayman Is.
Saint Martin (French)|80.8|15.7|St-Martin
Faroe Islands|80.8|20.2|Faeroe Is.
Oman|80.7|51.4
Czechia|80.3|15.8
Panama|80.1|24.7
Jersey|80.1|10.7
Albania|80.1|35.6
Anguilla|79.9|24.8
Falkland Islands|79.8|30.3|Falkland Is.
United States|79.8|11.7|United States of America
Estonia|79.6|13.3
Saudi Arabia|79.4|39.4
New Caledonia|79.2|34.1
Northern Mariana Islands|79.2|21.0|N. Mariana Is.
Poland|79.2|20.8
Croatia|79.1|20.6
Wallis and Futuna|79.0|34.9|Wallis and Futuna Is.
China|79.0|35.2
Slovakia|78.8|18.0
Cuba|78.6|19.6
Uruguay|78.6|13.0
Kosovo|78.6|35.1
Turks and Caicos Islands|78.5|29.9|Turks and Caicos Is.
Bosnia and Herzegovina|78.4|31.1|Bosnia and Herz.
Türkiye|78.4|31.1|Turkey
Jordan|78.3|37.4
Peru|78.3|32.3
Colombia|78.3|30.0
Iran|78.2|40.1
Lebanon|78.2|18.3
Antigua and Barbuda|78.1|20.0|Antigua and Barb.
Sri Lanka|78.0|24.9
Bonaire, St. Eustatius & Saba|78.0|16.4|12.2,-68.26
Ecuador|77.9|29.5
Argentina|77.8|16.6
North Macedonia|77.8|27.2|Macedonia
Guam|77.8|18.2
British Virgin Islands|77.8|24.4|British Virgin Is.
Montenegro|77.6|19.6
French Guiana|77.5|29.8|4.0,-53.0
Hungary|77.5|15.4
State of Palestine|77.4|31.7|Palestine
Tokelau|77.4|22.7|-9.2,-171.85
Curaçao|77.3|17.1
Serbia|77.3|22.2
Saint Helena|77.3|11.3
St. Pierre & Miquelon|77.3|14.3|St. Pierre and Miquelon
Malaysia|77.2|28.7
Tunisia|77.1|38.9
Thailand|77.1|31.9
Algeria|76.9|34.2
Sint Maarten (Dutch)|76.9|14.4|Sint Maarten
Aruba|76.8|18.8
Montserrat|76.7|28.1
Barbados|76.6|23.1
Latvia|76.6|12.1
Mayotte|76.6|34.4|-12.83,45.15
Cabo Verde|76.6|31.6
Lithuania|76.5|10.4
Romania|76.4|15.9
Brazil|76.4|27.8
Armenia|76.2|21.6
U.S. Virgin Islands|76.2|16.3|U.S. Virgin Is.
Bulgaria|76.1|14.7
Morocco|75.9|37.1
Cook Islands|75.8|37.9|Cook Is.
Brunei|75.8|25.3
Grenada|75.7|22.9
Mexico|75.6|31.8
Bangladesh|75.5|38.1
Mauritius|75.4|23.5
Nicaragua|75.4|34.8
Libya|75.2|42.1
Vietnam|75.0|27.0
Ukraine|75.0|13.8
Bahamas|75.0|16.1
Georgia|75.0|17.3
Belarus|75.0|16.3
Azerbaijan|74.9|28.6
Kazakhstan|74.8|19.2
Paraguay|74.2|16.2
Dominican Republic|74.1|30.1|Dominican Rep.
Belize|74.1|24.9
Suriname|74.0|23.3
North Korea|74.0|59.8
Trinidad and Tobago|73.9|16.9
Bhutan|73.8|38.5
Russia|73.7|18.2
Syria|73.4|31.0
Tonga|73.4|25.0
Honduras|73.4|32.3
Seychelles|73.3|15.5
American Samoa|73.3|14.1
Saint Lucia|73.2|24.9
Guatemala|73.0|35.2
Venezuela|73.0|21.9
Uzbekistan|72.8|19.4
El Salvador|72.7|28.5
India|72.7|31.5
Iraq|72.6|35.2
Saint Kitts and Nevis|72.6|17.8|St. Kitts and Nevis
Mongolia|72.5|33.9
Tajikistan|72.2|22.8
Egypt|72.2|38.2
Kyrgyzstan|72.1|20.0
Samoa|72.1|22.9
Vanuatu|72.0|28.1
Western Sahara|72.0|37.0|W. Sahara
Jamaica|71.9|15.3
St. Vincent & the Grenadines|71.7|24.8|St. Vin. and Gren.
Dominica|71.6|27.1
Moldova|71.6|17.6
Indonesia|71.6|31.4
Nepal|71.2|33.6
Cambodia|71.1|32.3
Solomon Islands|71.0|29.5|Solomon Is.
Guyana|70.6|21.4
Turkmenistan|70.5|22.4
Greenland|70.4|30.9
Niue|70.4|15.8
Sao Tome and Principe|70.3|31.1|São Tomé and Principe
Philippines|70.2|16.6
Yemen|69.7|40.8
Laos|69.7|30.8
Palau|69.6|16.9
Botswana|69.6|23.4
Eritrea|69.4|36.1
Senegal|69.4|32.9
Mauritania|69.2|30.8
Bolivia|69.1|28.4
Uganda|68.9|29.2
Gabon|68.9|29.6
Rwanda|68.5|25.3
Timor-Leste|68.3|39.2
Ethiopia|68.1|32.6
Pakistan|68.1|33.8
Malawi|67.9|35.3
Namibia|67.8|25.9
Fiji|67.8|16.1
Micronesia|67.7|19.3
Tanzania|67.6|26.6
Tuvalu|67.6|27.6|-8.52,179.2
Myanmar|67.5|31.8
Comoros|67.5|30.1
Marshall Islands|67.3|14.7|Marshall Is.
Sudan|66.9|21.1
Zambia|66.9|20.1
Kiribati|66.9|21.1
Afghanistan|66.8|38.6
South Africa|66.7|23.5
Djibouti|66.6|25.9
Papua New Guinea|66.5|27.1
Gambia|66.5|35.3
Republic of the Congo|66.4|26.8|Congo
Ghana|66.1|23.0
Haiti|65.5|28.2
Angola|65.2|29.3
Guinea-Bissau|64.6|28.9
Eswatini|64.5|21.1|eSwatini
Cameroon|64.5|31.4
Equatorial Guinea|64.3|24.2|Eq. Guinea
Madagascar|64.3|24.6
Kenya|64.2|27.3
Mozambique|64.1|26.8
Burundi|64.1|23.2
Zimbabwe|63.6|14.2
Togo|63.3|21.4
Liberia|62.6|24.7
Nauru|62.6|6.0
Côte d'Ivoire|62.4|31.6
DR Congo|62.4|24.2|Dem. Rep. Congo
Sierra Leone|62.3|33.4
Niger|61.9|26.0
Burkina Faso|61.6|28.6
Benin|61.3|25.9
Guinea|61.2|25.6
Mali|61.1|32.4
Somalia|59.3|17.8
Lesotho|58.6|14.0
Central African Republic|58.2|22.7|Central African Rep.
South Sudan|58.0|27.8|S. Sudan
Chad|55.6|20.4
Nigeria|55.0|19.4
"""

here = pathlib.Path(__file__).resolve().parent.parent
topo = json.loads((here / "data/countries-50m.json").read_text())
geo_names = {g["properties"]["name"] for g in topo["objects"]["countries"]["geometries"]}

rows, used = [], set()
for line in ROWS.strip().splitlines():
    p = line.split("|")
    row = {"name": p[0], "le": float(p[1]), "gain": float(p[2])}
    key = p[3] if len(p) > 3 else p[0]
    if key[0] in "-0123456789":
        row["at"] = [float(x) for x in key.split(",")]
    else:
        assert key in geo_names, f"no polygon named {key!r}"
        assert key not in used, key
        used.add(key)
        row["geo"] = key
    rows.append(row)

out = {"world": {"le": 73.8, "gain": 27.4}, "rows": rows}
(here / "data/life.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(len(rows), "rows;", "polygons without data:", sorted(geo_names - used))
