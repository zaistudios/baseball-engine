/**
 * THE OTHER EIGHT MEN, BY NAME. Two hundred and forty of them.
 *
 * ⚠️ THE NAMES ARE THE ONE PART OF THE DEPTH THAT IS NOT GENERATED, AND THAT IS
 * THE WHOLE POINT. depth.ts can work out what a mop-up man's break rating
 * should be; it cannot work out that Buffalo's is called Black Ice Nowakowski
 * and Phoenix's is called Water Break Descheny. A club in this league is a
 * VOICE before it is a set of numbers — Maine is French-Canadian and lobster,
 * Detroit is machines in capitals, Cincinnati is pork and the Rhineland — and a
 * roster where nine men are in that voice and eight are called "CHF Reliever 6"
 * is a roster with the flavour switched off two thirds of the way down.
 *
 * ⚠️ EIGHT PER CLUB, IN SLOT ORDER, AND THE ORDER IS LOAD-BEARING:
 *
 *   0-1  the fourth and fifth starters
 *   2-6  the long man, two middle men, the matchup arm, the mop-up man
 *   7    the fourth bench man
 *
 * A club that already carries some of them takes its names from the SAME slots
 * — see fillRoster(). Reordering this list renames men in a running franchise.
 *
 * ⚠️ EVERY FULL NAME IN THE LEAGUE IS UNIQUE AND HAS TO BE. rotation.ts keys
 * its whole rest ledger by name, because a Pitcher has no id — two men sharing
 * one would share one arm's fatigue for the season. depth.test.ts holds the
 * league to it. SURNAMES repeat freely and always have (there is a Bracco in
 * two clubs); it is the whole string that must not.
 */

/** Club abbreviation to its eight depth names, in slot order. */
export const DEPTH_NAMES: Readonly<Record<string, readonly string[]>> = {
  // New York City Empire — money, contracts and the front office.
  NYE: [
    'Arbitration Cassano', 'Fifth Avenue Nardo',
    'Option Year Petrocelli', 'Midtown Kelleher', 'Signing Bonus Aiello',
    'Late Scratch Vasilyev', 'Mop Up Delvecchio',
    'September Callup Rizzo',
  ],
  // New York Vets — everybody else's thirty-six-year-olds.
  NYV: [
    'Second Wind Pilarski', 'Rehab Start Grieco',
    'Innings Eater Radulescu', 'Veteran Minimum Sarno', 'Knee Brace Fiore',
    'Left Hander Ostrowski', 'Bus Ride Petrella',
    'Bench Coach Zappala',
  ],
  // Los Angeles Comets — the money went across town and then out of state.
  LAC: [
    'Rewrite Okada', 'Table Read Marchesi',
    'Craft Service Nakagawa', 'Standby Talent Iwasaki', 'Below The Line Cardoza',
    'Day Player Mireles', 'Residuals Hargrove',
    'Location Scout Penaflor',
  ],
  // Los Angeles Aqueducts — the water still runs and the money stopped.
  LAA: [
    'Penstock Amaya', 'Silt Trap Oyelaran',
    'Aqueduct Mile Duffy', 'Standpipe Corliss', 'Weir Gate Castellanos',
    'Sluice Box Aguirre', 'Dry Wash Prendergast',
    'Water Table Osborne',
  ],
  // Chicago Firemen — the deepest pen in the league, and now it is deeper.
  CHF: [
    'Third Alarm Pilsudski', 'Wet Line Bartosz',
    'Backdraft Marchewka', 'Halligan Bar Sobieski', 'Turnout Gear Lisowski',
    'Standpipe Rzepka', 'Overhaul Kaczmarek',
    'Firehouse Cot Wachowski',
  ],
  // Chicago Ivy — day baseball, a living wall and no titles.
  CHI: [
    'Waveland Doheny', 'Rooftop Seat Mazurek',
    'Afternoon Game Trilling', 'Marquee Board Sostak', 'Brick Wall Lindqvist',
    'Ballhawk Renfroe', 'Bleacher Bum Salgado',
    'Warning Track Vlach',
  ],
  // Albany Holdouts — the canal, the capitol, and the last all-human club.
  ALB: [
    'Mule Path Hasbrouck', 'Aqueduct Row Van Slyke',
    'Barge Line Teodoro', 'Weighlock Coughlin', 'Feeder Canal Boudreau',
    'Night Watch Halloran', 'Union Card Gasparro',
    'Signing Day Vanderlyn',
  ],
  // Baltimore Crabbers — the bay, the mallet and nine fouled-off pitches.
  BAL: [
    'Soft Shell Danowski', 'Trotline Bercik',
    'Marsh Grass Adeyemo', 'Peeler Run Kucharski', 'Shell Pile Fenwick',
    'Old Bay Zawistowski', 'Low Tide Vandiver',
    'Dock Scale Hoyle',
  ],
  // Buffalo Snowplows — six feet of it, twice a winter.
  BUF: [
    'Drift Line Wilczynski', 'Snow Fence Pietrzak',
    'Second Shovel Krupinski', 'Roof Rake Grabowski', 'Thaw Week Slusarczyk',
    'Black Ice Nowakowski', 'Cold Snap Wojtowicz',
    'Chain Up Sikorski',
  ],
  // Cincinnati Pigs — they were first, and the pork capital before that.
  CIN: [
    'Over The Rhine Duerr', 'Packing House Schnell',
    'Canal Basin Wurtz', 'Hog Drover Ecklein', 'Findlay Market Rausch',
    'Smokehouse Leinweber', 'Lard Rendering Bosse',
    'Opening Day Gruber',
  ],
  // Cleveland Rivets — nine machines off the same line, and the men who ran it.
  CLE: [
    'Flux Line Havlicek', 'Bar Mill Rusnak',
    'Slag Heap Prokop', 'Ingot Mold Stefanik', 'Skip Hoist Dudek',
    'Cold Roll Machacek', 'Scale Pit Novosad',
    'Second Trick Vlasak',
  ],
  // Denver Void — a mile up, where nobody has learned to pitch.
  DEN: [
    'Mile High Sedlacek', 'No Break Vandegrift',
    'Tree Line Bohannon', 'Oxygen Debt Reasoner', 'Snowmelt Chacon',
    'Front Range Ybarra', 'Nine Eight Loveless',
    'Long Haul Pittman',
  ],
  // Detroit Foundry — machines, in capitals, off the same line.
  DET: [
    'PRESS LINE-7', 'CUPOLA-4',
    'SAND MULLER', 'GRINDER-2', 'LADLE-9',
    'CORE BOX', 'SHAKEOUT',
    'THIRD SHIFT',
  ],
  // Florida Stingrays — spliced, storm-season, up for anything.
  FLA: [
    'Sawgrass Betancourt', 'Turnpike Mile Arocha',
    'Panhandle Duguay', 'Brackish Nadeau', 'Hurricane Party Lykins',
    'Mosquito Coast Villalobos', 'Tarpon Run Escalante',
    'Snowbird Season Kettering',
  ],
  // Kansas City Freight — a yard, a schedule and nobody who was drafted.
  KCF: [
    'Switch List Bogard', 'Interchange Culwell',
    'Air Brake Culpepper', 'Flat Car Renshaw', 'Waybill Stipe',
    'Siding Track Amador', 'Caboose Light Odell',
    'Rip Track Meeks',
  ],
  // Memphis Riverboats — everything on the card and everything on the table.
  MEM: [
    'Deck Passage Vestal', 'River Stage Delahoussaye',
    'Full House Rideout', 'Table Stakes Aubuchon', 'Ante Up Sistrunk',
    'Draw Two Guillory', 'Bust Hand Pouncey',
    'Cheap Seat Delahunt',
  ],
  // Milwaukee Coopers — barrel makers, built like one.
  MIL: [
    'Barrel Head Schierl', 'Croze Cut Bublitz',
    'Chime Hoop Vandehey', 'Mash Tun Roggenbuck', 'Cask Line Steinmetz',
    'Wort Chill Kupfer', 'Draft Horse Weninger',
    'Taproom Bench Zuehlke',
  ],
  // Minneapolis Millers — flour, ice and patience.
  MIN: [
    'Grain Elevator Sjoberg', 'Bran Line Aakre',
    'Roller Mill Hovda', 'Sifter Deck Ellingson', 'Thirty Below Kvamme',
    'Mill Race Nyberg', 'Chaff Pile Torkelson',
    'Long Winter Sandvik',
  ],
  // Maine Lobsters — traps, fog and a French-Canadian phone book.
  MNE: [
    'Buoy Line Cyr', 'Haul Back Cormier',
    'Gauge Stick Ouellet', 'Banding Table Belanger', 'Shedder Season Pelchat',
    'Fog Bank Thibeault', 'Wharf Rat Cloutier',
    'Deckhand Morin',
  ],
  // New England Minutemen — stone walls, town meetings and two-out singles.
  NEM: [
    'Musket Ball Alden', 'Town Meeting Hollis',
    'Rail Fence Chadbourne', 'Militia Drum Pickering', 'Blacksmith Row Standish',
    'Winter Quarters Bradstreet', 'Salt Marsh Endicott',
    'Common Green Wadsworth',
  ],
  // New Orleans Spirit — a funeral that decided to be a party.
  NOL: [
    'Sousaphone Broussard', 'Levee Board Prejean',
    'Above Ground Boudreaux', 'Snare Drum Comeaux', 'Streetcar Line Naquin',
    'Jazz Funeral Melancon', 'Krewe Float Hebert',
    'Second Set Arceneaux',
  ],
  // Oklahoma City Dustbowl — no money, no staff, and the whole town turns out.
  OKC: [
    'Black Sunday Wofford', 'Section Line Tullos',
    'Red Dirt Hollaway', 'Fence Row Pankey', 'Hardpan Yeargin',
    'Tumbleweed Skaggs', 'Cattle Guard Prine',
    'Bus Fare Renfro',
  ],
  // Philadelphia Ironsides — plate armour and a grudge.
  PHI: [
    'Dry Dock Feeney', 'Yard Whistle Trombetta',
    'Shipfitter Devaney', 'Armor Belt Kachmar', 'Gun Deck Mangano',
    'Ram Bow Scalise', 'Turret Ring Hanrahan',
    'Powder Room Cerrone',
  ],
  // Phoenix Flames — the fastest staff in the league, at a hundred and ten.
  PHX: [
    'Hundred And Five Nez', 'Dry Heat Benally',
    'Saguaro Shade Manuelito', 'Haboob Tsosie', 'Swamp Cooler Etsitty',
    'Century Mark Largo', 'Sun Shade Bitsui',
    'Water Break Descheny',
  ],
  // Pittsburgh Puddlers — stirred molten iron by hand until the mills stopped.
  PIT: [
    'Puddling Rabble Hnatko', 'Bessemer Blow Slivka',
    'Pig Bed Pavlicek', 'Cinder Notch Zubek', 'Roll Stand Hruska',
    'Mill Hunky Zajac', 'Nine Mile Run Bartko',
    'Company House Danko',
  ],
  // Seattle Rain-Men — the wettest park in the league, at peace with it.
  SEA: [
    'Marine Layer Okabe', 'Squall Line Yamashiro',
    'Long Rain Iwamoto', 'Ninety Percent Ueda', 'Puddle Deck Bjornson',
    'Sea Fret Matsuda', 'Gutter Full Sandstrom',
    'Wet Bench Lindholm',
  ],
  // San Francisco Foghorns — heard long before they are seen.
  SFO: [
    'Night Fog Adisa', 'Ocean Beach Nwosu',
    'Mile Rock Baptista', 'Tide Book Oyelowo', 'Windward Sagoe',
    'Cliff House Amadi', 'Foghorn Watch Dansoko',
    'Ferry Slip Boateng',
  ],
  // St. Louis Ferryman — river crossings, and the man who takes the toll.
  STL: [
    'River Mile Zajicek', 'Ferry Bell Hruby',
    'Landing Stage Petrik', 'Rope Line Vodicka', 'Low Water Cermak',
    'Night Crossing Kolar', 'Dead Slow Sykora',
    'Near Bank Blazek',
  ],
  // Texas Wildcats — the biggest bats and the worst two-strike approach.
  TEX: [
    'Mud Logger Chalfant', 'Dry Hole Bledsoe',
    'Kelly Bushing Ainsworth', 'Derrick Floor Kilgore', 'Christmas Tree Beaumont',
    'Wildcatter Slaughter', 'Pump Jack Trahan',
    'Lease Road Pickens',
  ],
  // Toronto Travelers — nine men from nine places, playing a road season.
  TOR: [
    'Layover Krishnan', 'Departures Board Vukovic',
    'Baggage Claim Nkemelu', 'Standby Seat Haraldsson', 'Gate Change Villanueva',
    'Duty Free Sandhu', 'Overnight Bag Kirilenko',
    'Aisle Seat Persaud',
  ],
};
