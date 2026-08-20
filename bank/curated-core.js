/* ============================================================
   Answer It — curated core question bank
   ------------------------------------------------------------
   Hand-written questions. This exists because the public trivia APIs skew obscure,
   dry and Anglo-American (see QUESTIONS.md). The curated core carries the questions
   that decide whether a game is fun; filtered API questions only pad out volume.

   Loaded as a CLASSIC script (no import/export) so it works over file:// exactly
   like the rest of the site:  <script src="bank/curated-core.js"></script>
   The Worker gets it with a side-effect import:  import "../../bank/curated-core.js";
   then reads globalThis.ANSWER_IT_CURATED.

   Row shape (compact on purpose — this file is shipped to every player):
     c  category key (§4)          l  level: easy | medium | hard
     n  niche → eligible for native Hell (§5.2)
     t  question text              a  correct answer        w  three wrong options
     r  region flavour tag: africa | asia | latam | mena | europe | na | global
     o  true → also good as an OPEN question (§10): short, unambiguous, one spelling
   ============================================================ */
(function () {
  const B = [

  /* ---------- general ---------- */
  { c:"general", l:"easy",   t:"What is the largest ocean on Earth?", a:"The Pacific", w:["The Atlantic","The Indian","The Arctic"], r:"global", o:true },
  { c:"general", l:"easy",   t:"How many minutes are there in a full day?", a:"1,440", w:["720","960","2,400"], r:"global", o:true },
  { c:"general", l:"easy",   t:"Which planet is known as the Red Planet?", a:"Mars", w:["Venus","Jupiter","Mercury"], r:"global", o:true },
  { c:"general", l:"easy",   t:"What is the chemical symbol for gold?", a:"Au", w:["Ag","Gd","Go"], r:"global", o:true },
  { c:"general", l:"easy",   t:"What is the tallest animal in the world?", a:"The giraffe", w:["The elephant","The ostrich","The camel"], r:"global", o:true },
  { c:"general", l:"easy",   t:"Mixing blue and yellow paint gives you which colour?", a:"Green", w:["Purple","Orange","Brown"], r:"global", o:true },
  { c:"general", l:"easy",   t:"Which is the only even prime number?", a:"2", w:["1","4","0"], r:"global", o:true },
  { c:"general", l:"medium", t:"What is the world's largest desert?", a:"Antarctica", w:["The Sahara","The Arabian Desert","The Gobi"], r:"global", o:true },
  { c:"general", l:"medium", t:"Which is the only mammal that can truly fly?", a:"The bat", w:["The flying squirrel","The colugo","The flying fox lizard"], r:"global", o:true },
  { c:"general", l:"medium", t:"How many keys does a standard full-size piano have?", a:"88", w:["76","92","64"], r:"global", o:true },
  { c:"general", l:"medium", t:"Which blood type is the universal donor?", a:"O negative", w:["AB positive","A positive","B negative"], r:"global", o:true },
  { c:"general", l:"medium", t:"Roughly how long does sunlight take to reach Earth?", a:"About 8 minutes", w:["About 8 seconds","About 8 hours","Instantly"], r:"global" },
  { c:"general", l:"medium", t:"What is the largest island in the world?", a:"Greenland", w:["New Guinea","Borneo","Madagascar"], r:"global", o:true },
  { c:"general", l:"medium", t:"What is the smallest country in the world by area?", a:"Vatican City", w:["Monaco","San Marino","Nauru"], r:"europe", o:true },
  { c:"general", l:"medium", t:"Which metal is liquid at room temperature?", a:"Mercury", w:["Lead","Tin","Gallium"], r:"global", o:true },
  { c:"general", l:"medium", t:"How many bones are in the adult human body?", a:"206", w:["186","226","306"], r:"global", o:true },
  { c:"general", l:"medium", t:"What is the largest organ of the human body?", a:"The skin", w:["The liver","The lungs","The intestines"], r:"global", o:true },
  { c:"general", l:"hard",   t:"What is the most abundant element in the universe?", a:"Hydrogen", w:["Oxygen","Carbon","Helium"], r:"global", o:true },
  { c:"general", l:"hard",   t:"How many hearts does an octopus have?", a:"Three", w:["One","Two","Eight"], r:"global", o:true },
  { c:"general", l:"hard",   t:"In Morse distress signalling, what does SOS actually stand for?", a:"Nothing — it was picked for its easy signal", w:["Save Our Souls","Save Our Ship","Send Out Succour"], n:true, r:"global" },
  { c:"general", l:"hard",   t:"Which country has the most time zones?", a:"France", w:["Russia","The United States","China"], n:true, r:"global", o:true },
  { c:"general", l:"hard",   t:"What is the only food that never spoils?", a:"Honey", w:["Rice","Salt","Dried beans"], r:"global", o:true },
  { c:"general", l:"hard",   t:"How long did the Hundred Years' War last?", a:"116 years", w:["100 years","99 years","121 years"], n:true, r:"europe" },
  { c:"general", l:"hard",   t:"Which is the only country that is also a continent and an island?", a:"Australia", w:["Greenland","Madagascar","Iceland"], r:"global", o:true },

  /* ---------- science ---------- */
  { c:"science", l:"easy",   t:"Which gas do plants take in from the air?", a:"Carbon dioxide", w:["Oxygen","Nitrogen","Hydrogen"], r:"global", o:true },
  { c:"science", l:"easy",   t:"How many legs does a spider have?", a:"Eight", w:["Six","Ten","Twelve"], r:"global", o:true },
  { c:"science", l:"easy",   t:"Which organ pumps blood around the body?", a:"The heart", w:["The liver","The lungs","The kidneys"], r:"global", o:true },
  { c:"science", l:"easy",   t:"What is the closest star to Earth?", a:"The Sun", w:["Proxima Centauri","Sirius","Alpha Centauri A"], r:"global", o:true },
  { c:"science", l:"easy",   t:"What is the largest animal that has ever lived?", a:"The blue whale", w:["The African elephant","Argentinosaurus","The sperm whale"], r:"global", o:true },
  { c:"science", l:"easy",   t:"How many teeth does an adult human normally have?", a:"32", w:["28","30","36"], r:"global", o:true },
  { c:"science", l:"easy",   t:"What do we call an animal that eats only plants?", a:"A herbivore", w:["A carnivore","An omnivore","A detritivore"], r:"global", o:true },
  { c:"science", l:"medium", t:"Which gas makes up about 78% of the air we breathe?", a:"Nitrogen", w:["Oxygen","Carbon dioxide","Argon"], r:"global", o:true },
  { c:"science", l:"medium", t:"Which vitamin does your skin make from sunlight?", a:"Vitamin D", w:["Vitamin C","Vitamin A","Vitamin B12"], r:"global", o:true },
  { c:"science", l:"medium", t:"What is the chemical symbol for potassium?", a:"K", w:["P","Po","Pt"], r:"global", o:true },
  { c:"science", l:"medium", t:"Which blood vessels carry blood away from the heart?", a:"Arteries", w:["Veins","Capillaries","Venules"], r:"global", o:true },
  { c:"science", l:"medium", t:"Which planet spins on its side?", a:"Uranus", w:["Neptune","Saturn","Venus"], r:"global", o:true },
  { c:"science", l:"medium", t:"Roughly how fast does light travel in a vacuum?", a:"About 300,000 km per second", w:["About 30,000 km per second","About 3 million km per second","About 3,000 km per second"], r:"global" },
  { c:"science", l:"medium", t:"What is the largest land animal alive today?", a:"The African bush elephant", w:["The white rhinoceros","The hippopotamus","The giraffe"], r:"africa", o:true },
  { c:"science", l:"medium", t:"Which part of the cell is called the powerhouse?", a:"The mitochondrion", w:["The nucleus","The ribosome","The Golgi body"], r:"global", o:true },
  { c:"science", l:"medium", t:"Which is the longest bone in the human body?", a:"The femur", w:["The tibia","The humerus","The spine"], r:"global", o:true },
  { c:"science", l:"hard",   t:"Which subatomic particle carries no electric charge?", a:"The neutron", w:["The proton","The electron","The positron"], r:"global", o:true },
  { c:"science", l:"hard",   t:"On Venus, which is longer — a day or a year?", a:"A day", w:["A year","They are equal","Venus has no year"], n:true, r:"global" },
  { c:"science", l:"hard",   t:"What is the study of fungi called?", a:"Mycology", w:["Botany","Entomology","Virology"], n:true, r:"global", o:true },
  { c:"science", l:"hard",   t:"Which galaxy is the Milky Way on course to collide with?", a:"Andromeda", w:["The Triangulum Galaxy","The Whirlpool Galaxy","The Large Magellanic Cloud"], r:"global", o:true },
  { c:"science", l:"hard",   t:"What is the pH of pure water at room temperature?", a:"7", w:["0","10","14"], r:"global", o:true },
  { c:"science", l:"hard",   t:"Which element has the atomic number 1?", a:"Hydrogen", w:["Helium","Carbon","Oxygen"], r:"global", o:true },
  { c:"science", l:"hard",   t:"Which sense is processed by the temporal lobe's auditory cortex?", a:"Hearing", w:["Sight","Smell","Balance"], n:true, r:"global", o:true },

  ];
  globalThis.ANSWER_IT_CURATED = (globalThis.ANSWER_IT_CURATED || []).concat(B);
})();

(function () {
  const B = [

  /* ---------- history ---------- */
  { c:"history", l:"easy",   t:"Who was the first person to walk on the Moon?", a:"Neil Armstrong", w:["Buzz Aldrin","Yuri Gagarin","Michael Collins"], r:"global", o:true },
  { c:"history", l:"easy",   t:"Which wall came down in 1989?", a:"The Berlin Wall", w:["Hadrian's Wall","The Great Wall of China","The Walls of Jericho"], r:"europe", o:true },
  { c:"history", l:"easy",   t:"Who became South Africa's first Black president in 1994?", a:"Nelson Mandela", w:["Desmond Tutu","Thabo Mbeki","Steve Biko"], r:"africa", o:true },
  { c:"history", l:"easy",   t:"Which ancient civilisation built the pyramids at Giza?", a:"The Egyptians", w:["The Sumerians","The Persians","The Greeks"], r:"africa", o:true },
  { c:"history", l:"easy",   t:"In which country were the ancient Olympic Games held?", a:"Greece", w:["Italy","Egypt","Turkey"], r:"europe", o:true },
  { c:"history", l:"easy",   t:"Which empire did Genghis Khan found?", a:"The Mongol Empire", w:["The Ottoman Empire","The Qing Empire","The Persian Empire"], r:"asia", o:true },
  { c:"history", l:"medium", t:"Nigeria gained independence from Britain in which year?", a:"1960", w:["1957","1963","1948"], r:"africa", o:true },
  { c:"history", l:"medium", t:"Mansa Musa, often called the richest person in history, ruled which empire?", a:"The Mali Empire", w:["The Songhai Empire","The Kingdom of Kush","The Ashanti Empire"], r:"africa", o:true },
  { c:"history", l:"medium", t:"Which country gave the Statue of Liberty to the United States?", a:"France", w:["Britain","Spain","The Netherlands"], r:"na", o:true },
  { c:"history", l:"medium", t:"Who was the first woman to win a Nobel Prize?", a:"Marie Curie", w:["Rosalind Franklin","Ada Lovelace","Dorothy Hodgkin"], r:"europe", o:true },
  { c:"history", l:"medium", t:"Which country was known as Persia until 1935?", a:"Iran", w:["Iraq","Turkey","Afghanistan"], r:"mena", o:true },
  { c:"history", l:"medium", t:"Which Indian leader led the 1930 Salt March?", a:"Mahatma Gandhi", w:["Jawaharlal Nehru","Subhas Chandra Bose","B. R. Ambedkar"], r:"asia", o:true },
  { c:"history", l:"medium", t:"In which year did the Second World War end?", a:"1945", w:["1944","1946","1939"], r:"global", o:true },
  { c:"history", l:"medium", t:"Which Egyptian queen allied with Julius Caesar and Mark Antony?", a:"Cleopatra", w:["Nefertiti","Hatshepsut","Zenobia"], r:"africa", o:true },
  { c:"history", l:"medium", t:"Which African country was never formally colonised by a European power?", a:"Ethiopia", w:["Ghana","Kenya","Senegal"], r:"africa", o:true },
  { c:"history", l:"medium", t:"Which system of enforced racial segregation ran in South Africa until 1994?", a:"Apartheid", w:["Jim Crow","Indenture","The Pass Laws Union"], r:"africa", o:true },
  { c:"history", l:"hard",   t:"Which treaty formally ended the First World War?", a:"The Treaty of Versailles", w:["The Treaty of Trianon","The Treaty of Ghent","The Treaty of Westphalia"], r:"europe", o:true },
  { c:"history", l:"hard",   t:"Constantinople was the capital of which empire before 1453?", a:"The Byzantine Empire", w:["The Ottoman Empire","The Holy Roman Empire","The Roman Republic"], r:"europe", o:true },
  { c:"history", l:"hard",   t:"The Berlin Conference of 1884-85 carved up which continent?", a:"Africa", w:["Asia","South America","Oceania"], r:"africa", o:true },
  { c:"history", l:"hard",   t:"The historic centre of learning, Timbuktu, is in which modern country?", a:"Mali", w:["Niger","Sudan","Morocco"], n:true, r:"africa", o:true },
  { c:"history", l:"hard",   t:"Who was the last Tsar of Russia?", a:"Nicholas II", w:["Alexander III","Peter III","Ivan VI"], n:true, r:"europe", o:true },
  { c:"history", l:"hard",   t:"Who co-wrote The Communist Manifesto with Friedrich Engels?", a:"Karl Marx", w:["Vladimir Lenin","Leon Trotsky","Rosa Luxemburg"], r:"europe", o:true },
  { c:"history", l:"hard",   t:"Which civilisation built Great Zimbabwe?", a:"The Shona", w:["The Zulu","The Portuguese","The Swahili of Kilwa"], n:true, r:"africa", o:true },
  { c:"history", l:"hard",   t:"Which empire was ruled from the city of Cusco?", a:"The Inca Empire", w:["The Aztec Empire","The Maya city-states","The Olmec"], n:true, r:"latam", o:true },

  /* ---------- geography ---------- */
  { c:"geography", l:"easy",   t:"What is the capital of Japan?", a:"Tokyo", w:["Osaka","Kyoto","Seoul"], r:"asia", o:true },
  { c:"geography", l:"easy",   t:"Which is the longest river in Africa?", a:"The Nile", w:["The Congo","The Niger","The Zambezi"], r:"africa", o:true },
  { c:"geography", l:"easy",   t:"Which is the largest country in the world by land area?", a:"Russia", w:["Canada","China","The United States"], r:"global", o:true },
  { c:"geography", l:"easy",   t:"Which country is shaped like a boot?", a:"Italy", w:["Greece","Portugal","Chile"], r:"europe", o:true },
  { c:"geography", l:"easy",   t:"What is the capital of Nigeria?", a:"Abuja", w:["Lagos","Kano","Ibadan"], r:"africa", o:true },
  { c:"geography", l:"easy",   t:"Which desert covers most of northern Africa?", a:"The Sahara", w:["The Kalahari","The Namib","The Gobi"], r:"africa", o:true },
  { c:"geography", l:"easy",   t:"Mount Everest sits on the border of Nepal and which other country?", a:"China", w:["India","Bhutan","Pakistan"], r:"asia", o:true },
  { c:"geography", l:"medium", t:"Which country has the world's largest population?", a:"India", w:["China","The United States","Indonesia"], r:"asia", o:true },
  { c:"geography", l:"medium", t:"Which is the largest country in Africa by area?", a:"Algeria", w:["Sudan","Democratic Republic of the Congo","Libya"], r:"africa", o:true },
  { c:"geography", l:"medium", t:"What is the capital of Australia?", a:"Canberra", w:["Sydney","Melbourne","Perth"], r:"global", o:true },
  { c:"geography", l:"medium", t:"What is the capital of Brazil?", a:"Brasilia", w:["Rio de Janeiro","Sao Paulo","Salvador"], r:"latam", o:true },
  { c:"geography", l:"medium", t:"Which two countries share the world's longest land border?", a:"Canada and the United States", w:["Russia and China","Argentina and Chile","India and Bangladesh"], r:"na" },
  { c:"geography", l:"medium", t:"Which strait separates Spain from Morocco?", a:"The Strait of Gibraltar", w:["The Bosphorus","The Strait of Hormuz","The Bab-el-Mandeb"], r:"mena", o:true },
  { c:"geography", l:"medium", t:"Which is Africa's largest lake by surface area?", a:"Lake Victoria", w:["Lake Tanganyika","Lake Malawi","Lake Chad"], r:"africa", o:true },
  { c:"geography", l:"medium", t:"Which country holds most of the Amazon rainforest?", a:"Brazil", w:["Peru","Colombia","Venezuela"], r:"latam", o:true },
  { c:"geography", l:"medium", t:"Which is the smallest continent?", a:"Australia", w:["Europe","Antarctica","South America"], r:"global", o:true },
  { c:"geography", l:"hard",   t:"What is the deepest known point in the ocean?", a:"The Challenger Deep", w:["The Puerto Rico Trench","The Java Trench","The Sunda Deep"], n:true, r:"global", o:true },
  { c:"geography", l:"hard",   t:"Which country's flag is the only national flag that is not rectangular?", a:"Nepal", w:["Switzerland","Vatican City","Bhutan"], r:"asia", o:true },
  { c:"geography", l:"hard",   t:"Which landlocked country is completely surrounded by South Africa?", a:"Lesotho", w:["Eswatini","Botswana","Zimbabwe"], n:true, r:"africa", o:true },
  { c:"geography", l:"hard",   t:"What is the world's largest lake by surface area?", a:"The Caspian Sea", w:["Lake Superior","Lake Victoria","Lake Baikal"], r:"global", o:true },
  { c:"geography", l:"hard",   t:"Which country has three capital cities?", a:"South Africa", w:["Bolivia","Malaysia","Sri Lanka"], n:true, r:"africa", o:true },
  { c:"geography", l:"hard",   t:"Which is the driest non-polar desert on Earth?", a:"The Atacama", w:["The Sahara","The Mojave","The Thar"], n:true, r:"latam", o:true },
  { c:"geography", l:"hard",   t:"Which is the world's tallest uninterrupted waterfall?", a:"Angel Falls", w:["Victoria Falls","Niagara Falls","Iguazu Falls"], r:"latam", o:true },
  { c:"geography", l:"hard",   t:"The Sahel runs along the southern edge of which desert?", a:"The Sahara", w:["The Kalahari","The Arabian Desert","The Danakil"], n:true, r:"africa", o:true },

  ];
  globalThis.ANSWER_IT_CURATED = (globalThis.ANSWER_IT_CURATED || []).concat(B);
})();

(function () {
  const B = [

  /* ---------- music ---------- */
  { c:"music", l:"easy",   t:"How many strings does a standard guitar have?", a:"Six", w:["Four","Five","Twelve"], r:"global", o:true },
  { c:"music", l:"easy",   t:"Which Jamaican legend sang 'No Woman, No Cry'?", a:"Bob Marley", w:["Peter Tosh","Jimmy Cliff","Burning Spear"], r:"latam", o:true },
  { c:"music", l:"easy",   t:"Which K-pop group released 'Dynamite'?", a:"BTS", w:["Blackpink","EXO","Stray Kids"], r:"asia", o:true },
  { c:"music", l:"easy",   t:"Which Nigerian star released the album 'Made in Lagos'?", a:"Wizkid", w:["Burna Boy","Davido","Olamide"], r:"africa", o:true },
  { c:"music", l:"easy",   t:"Who is known as the King of Pop?", a:"Michael Jackson", w:["Elvis Presley","Prince","James Brown"], r:"na", o:true },
  { c:"music", l:"easy",   t:"What do you call a group of four musicians playing together?", a:"A quartet", w:["A trio","A quintet","A sextet"], r:"global", o:true },
  { c:"music", l:"medium", t:"Which Nigerian musician pioneered Afrobeat and recorded 'Zombie'?", a:"Fela Kuti", w:["King Sunny Ade","Tony Allen","Ebenezer Obey"], r:"africa", o:true },
  { c:"music", l:"medium", t:"Which band recorded 'Bohemian Rhapsody'?", a:"Queen", w:["The Rolling Stones","Led Zeppelin","Pink Floyd"], r:"europe", o:true },
  { c:"music", l:"medium", t:"'Despacito' is by Luis Fonsi featuring which artist?", a:"Daddy Yankee", w:["Bad Bunny","J Balvin","Ozuna"], r:"latam", o:true },
  { c:"music", l:"medium", t:"Which Colombian singer's hits include 'Hips Don't Lie'?", a:"Shakira", w:["Karol G","Rosalia","Selena"], r:"latam", o:true },
  { c:"music", l:"medium", t:"The 2020 dance smash 'Jerusalema' came from which country?", a:"South Africa", w:["Nigeria","Ghana","Angola"], r:"africa", o:true },
  { c:"music", l:"medium", t:"Beyonce first became famous as part of which group?", a:"Destiny's Child", w:["TLC","En Vogue","SWV"], r:"na", o:true },
  { c:"music", l:"medium", t:"Which country did reggae originate in?", a:"Jamaica", w:["Trinidad and Tobago","Cuba","Barbados"], r:"latam", o:true },
  { c:"music", l:"medium", t:"How many strings does a violin have?", a:"Four", w:["Five","Six","Three"], r:"global", o:true },
  { c:"music", l:"medium", t:"Which composer wrote 'The Four Seasons'?", a:"Vivaldi", w:["Mozart","Bach","Handel"], r:"europe", o:true },
  { c:"music", l:"medium", t:"Which composer was almost completely deaf by the time he wrote his Ninth Symphony?", a:"Beethoven", w:["Mozart","Chopin","Schubert"], r:"europe", o:true },
  { c:"music", l:"hard",   t:"Which album is the best-selling of all time?", a:"Thriller", w:["Back in Black","The Dark Side of the Moon","Rumours"], r:"na", o:true },
  { c:"music", l:"hard",   t:"Which instrument is Yo-Yo Ma famous for playing?", a:"The cello", w:["The violin","The piano","The viola"], r:"global", o:true },
  { c:"music", l:"hard",   t:"'Kind of Blue', the best-selling jazz album ever, is by whom?", a:"Miles Davis", w:["John Coltrane","Duke Ellington","Charlie Parker"], n:true, r:"na", o:true },
  { c:"music", l:"hard",   t:"Which Senegalese singer recorded '7 Seconds' with Neneh Cherry?", a:"Youssou N'Dour", w:["Baaba Maal","Ismael Lo","Salif Keita"], n:true, r:"africa", o:true },
  { c:"music", l:"hard",   t:"Which Tuareg band from Mali won a Grammy for the album 'Tassili'?", a:"Tinariwen", w:["Amadou & Mariam","Songhoy Blues","Bombino"], n:true, r:"africa", o:true },
  { c:"music", l:"hard",   t:"In sheet music, what does the marking 'allegro' tell you to do?", a:"Play fast", w:["Play slowly","Play softly","Play loudly"], r:"europe", o:true },
  { c:"music", l:"hard",   t:"'The Girl from Ipanema' is a classic of which Brazilian genre?", a:"Bossa nova", w:["Samba","Forro","Tropicalia"], n:true, r:"latam", o:true },
  { c:"music", l:"hard",   t:"Which artist holds the record for the most Grammy wins?", a:"Beyonce", w:["Quincy Jones","Stevie Wonder","Alison Krauss"], n:true, r:"na", o:true },

  /* ---------- screen ---------- */
  { c:"screen", l:"easy",   t:"Which animated film features a lion cub named Simba?", a:"The Lion King", w:["Madagascar","Zootopia","Tarzan"], r:"global", o:true },
  { c:"screen", l:"easy",   t:"Which studio made the Toy Story films?", a:"Pixar", w:["DreamWorks","Illumination","Blue Sky"], r:"na", o:true },
  { c:"screen", l:"easy",   t:"Which superhero's real name is Bruce Wayne?", a:"Batman", w:["Superman","Iron Man","Green Lantern"], r:"global", o:true },
  { c:"screen", l:"easy",   t:"Nigeria's film industry is nicknamed what?", a:"Nollywood", w:["Naijawood","Lagoswood","Afriwood"], r:"africa", o:true },
  { c:"screen", l:"easy",   t:"Which Korean film won Best Picture at the 2020 Oscars?", a:"Parasite", w:["Oldboy","Train to Busan","Burning"], r:"asia", o:true },
  { c:"screen", l:"easy",   t:"Which TV series is built around the Iron Throne?", a:"Game of Thrones", w:["The Witcher","Vikings","The Last Kingdom"], r:"global", o:true },
  { c:"screen", l:"medium", t:"Who directed 'Jaws' and 'E.T.'?", a:"Steven Spielberg", w:["George Lucas","Ridley Scott","James Cameron"], r:"na", o:true },
  { c:"screen", l:"medium", t:"The Millennium Falcon flies in which franchise?", a:"Star Wars", w:["Star Trek","Battlestar Galactica","Dune"], r:"global", o:true },
  { c:"screen", l:"medium", t:"Which Japanese studio made 'Spirited Away'?", a:"Studio Ghibli", w:["Toei Animation","Madhouse","Kyoto Animation"], r:"asia", o:true },
  { c:"screen", l:"medium", t:"Which Indian film industry is based in Mumbai?", a:"Bollywood", w:["Tollywood","Kollywood","Sandalwood"], r:"asia", o:true },
  { c:"screen", l:"medium", t:"Who played T'Challa in Marvel's 'Black Panther'?", a:"Chadwick Boseman", w:["Michael B. Jordan","Daniel Kaluuya","John Boyega"], r:"na", o:true },
  { c:"screen", l:"medium", t:"'Money Heist' (La Casa de Papel) is a series from which country?", a:"Spain", w:["Mexico","Argentina","Italy"], r:"europe", o:true },
  { c:"screen", l:"medium", t:"Which sitcom's characters hang out at the coffee shop Central Perk?", a:"Friends", w:["Seinfeld","How I Met Your Mother","Frasier"], r:"na", o:true },
  { c:"screen", l:"medium", t:"Who directed 'Pulp Fiction'?", a:"Quentin Tarantino", w:["Martin Scorsese","Guy Ritchie","Coen Brothers"], r:"na", o:true },
  { c:"screen", l:"medium", t:"Which country produces the most feature films per year?", a:"India", w:["The United States","China","Nigeria"], r:"asia", o:true },
  { c:"screen", l:"hard",   t:"Which film is the highest-grossing of all time at the global box office?", a:"Avatar", w:["Avengers: Endgame","Titanic","Star Wars: The Force Awakens"], n:true, r:"global", o:true },
  { c:"screen", l:"hard",   t:"Which actor played James Bond in the most official films?", a:"Roger Moore", w:["Sean Connery","Daniel Craig","Pierce Brosnan"], n:true, r:"europe", o:true },
  { c:"screen", l:"hard",   t:"Which Senegalese director is called the father of African cinema?", a:"Ousmane Sembene", w:["Djibril Diop Mambety","Souleymane Cisse","Med Hondo"], n:true, r:"africa", o:true },
  { c:"screen", l:"hard",   t:"Which Makoto Shinkai anime film is built around two teenagers swapping bodies?", a:"Your Name", w:["Weathering with You","5 Centimetres per Second","A Silent Voice"], n:true, r:"asia", o:true },
  { c:"screen", l:"hard",   t:"Which film won the very first Academy Award for Best Picture?", a:"Wings", w:["The Jazz Singer","Sunrise","Metropolis"], n:true, r:"na", o:true },
  { c:"screen", l:"hard",   t:"'City of God' is a landmark film from which country?", a:"Brazil", w:["Mexico","Colombia","Argentina"], n:true, r:"latam", o:true },
  { c:"screen", l:"hard",   t:"Which 1997 film was the first to gross a billion dollars worldwide?", a:"Titanic", w:["Jurassic Park","Independence Day","The Lion King"], r:"global", o:true },
  { c:"screen", l:"hard",   t:"Which streaming series about a Spanish-language drug lord starred Wagner Moura as Pablo Escobar?", a:"Narcos", w:["El Chapo","Queen of the South","Ozark"], n:true, r:"latam", o:true },

  /* ---------- games ---------- */
  { c:"games", l:"easy",   t:"Which moustached plumber is Nintendo's mascot?", a:"Mario", w:["Luigi","Sonic","Kirby"], r:"global", o:true },
  { c:"games", l:"easy",   t:"In chess, which piece moves only diagonally?", a:"The bishop", w:["The rook","The knight","The pawn"], r:"global", o:true },
  { c:"games", l:"easy",   t:"Which game world is made of blocks and haunted by creepers?", a:"Minecraft", w:["Roblox","Terraria","Fortnite"], r:"global", o:true },
  { c:"games", l:"easy",   t:"Which Pokemon is Ash's famous partner?", a:"Pikachu", w:["Charizard","Bulbasaur","Eevee"], r:"asia", o:true },
  { c:"games", l:"easy",   t:"Which board game is about buying properties and charging rent?", a:"Monopoly", w:["Scrabble","Risk","Cluedo"], r:"global", o:true },
  { c:"games", l:"easy",   t:"What does FPS stand for in gaming?", a:"First-person shooter", w:["Fast play system","Full player score","Final phase stage"], r:"global" },
  { c:"games", l:"medium", t:"How many squares are on a chessboard?", a:"64", w:["36","81","100"], r:"global", o:true },
  { c:"games", l:"medium", t:"Which company makes the PlayStation?", a:"Sony", w:["Microsoft","Nintendo","Sega"], r:"asia", o:true },
  { c:"games", l:"medium", t:"Which anime features the Survey Corps fighting Titans?", a:"Attack on Titan", w:["Tokyo Ghoul","Demon Slayer","Jujutsu Kaisen"], r:"asia", o:true },
  { c:"games", l:"medium", t:"Master Chief is the hero of which game series?", a:"Halo", w:["Doom","Gears of War","Destiny"], r:"na", o:true },
  { c:"games", l:"medium", t:"Which is the best-selling video game of all time?", a:"Minecraft", w:["Grand Theft Auto V","Tetris","Wii Sports"], r:"global", o:true },
  { c:"games", l:"medium", t:"Which anime by Eiichiro Oda follows Monkey D. Luffy?", a:"One Piece", w:["Bleach","Naruto","Fairy Tail"], r:"asia", o:true },
  { c:"games", l:"medium", t:"In chess, which pieces start in the corners?", a:"The rooks", w:["The knights","The bishops","The queens"], r:"global", o:true },
  { c:"games", l:"medium", t:"Which country did the board game Go originate in?", a:"China", w:["Japan","Korea","India"], r:"asia", o:true },
  { c:"games", l:"hard",   t:"Which 1972 arcade game is credited with kicking off the video game industry?", a:"Pong", w:["Space Invaders","Pac-Man","Asteroids"], r:"global", o:true },
  { c:"games", l:"hard",   t:"Samus Aran is the hero of which game series?", a:"Metroid", w:["Mega Man","Contra","Castlevania"], n:true, r:"asia", o:true },
  { c:"games", l:"hard",   t:"What is the currency in The Legend of Zelda?", a:"Rupees", w:["Gil","Bells","Zenny"], n:true, r:"asia", o:true },
  { c:"games", l:"hard",   t:"Which studio developed The Witcher 3?", a:"CD Projekt Red", w:["Bethesda","BioWare","Ubisoft"], n:true, r:"europe", o:true },
  { c:"games", l:"hard",   t:"In Naruto, what is the name of the Nine-Tailed Fox sealed inside him?", a:"Kurama", w:["Shukaku","Gyuki","Matatabi"], n:true, r:"asia", o:true },
  { c:"games", l:"hard",   t:"Which puzzle game was created by Soviet engineer Alexey Pajitnov?", a:"Tetris", w:["Columns","Dr. Mario","Bejeweled"], n:true, r:"europe", o:true },
  { c:"games", l:"hard",   t:"How many tiles does each player start with in Scrabble?", a:"Seven", w:["Six","Eight","Ten"], n:true, r:"global", o:true },
  { c:"games", l:"hard",   t:"Which mobile game phenomenon had players catching creatures in the real world in 2016?", a:"Pokemon GO", w:["Ingress","Harry Potter: Wizards Unite","Jurassic World Alive"], r:"global", o:true },
  { c:"games", l:"hard",   t:"In Dungeons & Dragons, which die is rolled to resolve most attacks?", a:"The d20", w:["The d6","The d12","The d100"], n:true, r:"na", o:true },

  ];
  globalThis.ANSWER_IT_CURATED = (globalThis.ANSWER_IT_CURATED || []).concat(B);
})();

(function () {
  const B = [

  /* ---------- sport ---------- */
  { c:"sport", l:"easy",   t:"How many players from each side are on the pitch in football?", a:"Eleven", w:["Nine","Ten","Twelve"], r:"global", o:true },
  { c:"sport", l:"easy",   t:"Which country won the 2022 FIFA World Cup?", a:"Argentina", w:["France","Brazil","Croatia"], r:"latam", o:true },
  { c:"sport", l:"easy",   t:"How many rings are on the Olympic flag?", a:"Five", w:["Four","Six","Seven"], r:"global", o:true },
  { c:"sport", l:"easy",   t:"Usain Bolt runs for which country?", a:"Jamaica", w:["Trinidad and Tobago","The United States","Barbados"], r:"latam", o:true },
  { c:"sport", l:"easy",   t:"Which sport is played at Wimbledon?", a:"Tennis", w:["Cricket","Golf","Rugby"], r:"europe", o:true },
  { c:"sport", l:"easy",   t:"In tennis, what is a score of zero called?", a:"Love", w:["Nil","Duck","Blank"], r:"global", o:true },
  { c:"sport", l:"medium", t:"Which country has won the most FIFA World Cups?", a:"Brazil", w:["Germany","Italy","Argentina"], r:"latam", o:true },
  { c:"sport", l:"medium", t:"The Super Eagles is the national football team of which country?", a:"Nigeria", w:["Ghana","Cameroon","Senegal"], r:"africa", o:true },
  { c:"sport", l:"medium", t:"Which country hosted the first World Cup held in Africa?", a:"South Africa", w:["Morocco","Egypt","Nigeria"], r:"africa", o:true },
  { c:"sport", l:"medium", t:"How many players are in a cricket team?", a:"Eleven", w:["Nine","Ten","Twelve"], r:"asia", o:true },
  { c:"sport", l:"medium", t:"Which boxer called himself 'The Greatest'?", a:"Muhammad Ali", w:["Mike Tyson","Joe Frazier","Sugar Ray Robinson"], r:"na", o:true },
  { c:"sport", l:"medium", t:"The Tour de France is a race in which sport?", a:"Cycling", w:["Running","Motor racing","Rowing"], r:"europe", o:true },
  { c:"sport", l:"medium", t:"Which athlete has won the most Olympic gold medals?", a:"Michael Phelps", w:["Usain Bolt","Carl Lewis","Larisa Latynina"], r:"na", o:true },
  { c:"sport", l:"medium", t:"How many players from each team are on a volleyball court?", a:"Six", w:["Five","Seven","Eight"], r:"global", o:true },
  { c:"sport", l:"medium", t:"How long is a marathon?", a:"42.195 km", w:["40 km","45 km","50 km"], r:"global" },
  { c:"sport", l:"hard",   t:"Which African footballer won the Ballon d'Or in 1995?", a:"George Weah", w:["Samuel Eto'o","Didier Drogba","Abedi Pele"], n:true, r:"africa", o:true },
  { c:"sport", l:"hard",   t:"Which club has won the most European Cup / Champions League titles?", a:"Real Madrid", w:["AC Milan","Bayern Munich","Liverpool"], r:"europe", o:true },
  { c:"sport", l:"hard",   t:"Which country won the first Cricket World Cup in 1975?", a:"The West Indies", w:["Australia","England","India"], n:true, r:"global", o:true },
  { c:"sport", l:"hard",   t:"What is the maximum break in snooker?", a:"147", w:["100","155","180"], n:true, r:"europe", o:true },
  { c:"sport", l:"hard",   t:"Which martial art originated in Korea?", a:"Taekwondo", w:["Judo","Karate","Muay Thai"], r:"asia", o:true },
  { c:"sport", l:"hard",   t:"Which Kenyan runner was the first to run a marathon distance under two hours?", a:"Eliud Kipchoge", w:["Kenenisa Bekele","Haile Gebrselassie","Wilson Kipsang"], n:true, r:"africa", o:true },
  { c:"sport", l:"hard",   t:"What colour is the jersey worn by the Tour de France leader?", a:"Yellow", w:["Green","Polka dot","White"], r:"europe", o:true },
  { c:"sport", l:"hard",   t:"Which country invented judo?", a:"Japan", w:["China","Korea","Mongolia"], r:"asia", o:true },
  { c:"sport", l:"hard",   t:"In which sport would you perform a 'fosbury flop'?", a:"High jump", w:["Pole vault","Gymnastics","Diving"], n:true, r:"global", o:true },

  /* ---------- arts ---------- */
  { c:"arts", l:"easy",   t:"Who wrote 'Romeo and Juliet'?", a:"William Shakespeare", w:["Charles Dickens","Christopher Marlowe","John Milton"], r:"europe", o:true },
  { c:"arts", l:"easy",   t:"Who painted the Mona Lisa?", a:"Leonardo da Vinci", w:["Michelangelo","Raphael","Botticelli"], r:"europe", o:true },
  { c:"arts", l:"easy",   t:"Who wrote the Harry Potter books?", a:"J. K. Rowling", w:["Philip Pullman","Suzanne Collins","Rick Riordan"], r:"europe", o:true },
  { c:"arts", l:"easy",   t:"Who wrote 'Things Fall Apart'?", a:"Chinua Achebe", w:["Wole Soyinka","Ngugi wa Thiong'o","Ben Okri"], r:"africa", o:true },
  { c:"arts", l:"easy",   t:"What is the art of beautiful handwriting called?", a:"Calligraphy", w:["Typography","Lithography","Etching"], r:"global", o:true },
  { c:"arts", l:"easy",   t:"Which epic poem follows Odysseus on his long journey home?", a:"The Odyssey", w:["The Iliad","The Aeneid","Beowulf"], r:"europe", o:true },
  { c:"arts", l:"medium", t:"Who wrote 'Pride and Prejudice'?", a:"Jane Austen", w:["Charlotte Bronte","George Eliot","Virginia Woolf"], r:"europe", o:true },
  { c:"arts", l:"medium", t:"Which Colombian author wrote 'One Hundred Years of Solitude'?", a:"Gabriel Garcia Marquez", w:["Jorge Luis Borges","Mario Vargas Llosa","Isabel Allende"], r:"latam", o:true },
  { c:"arts", l:"medium", t:"Which artist painted melting clocks in 'The Persistence of Memory'?", a:"Salvador Dali", w:["Rene Magritte","Joan Miro","Marc Chagall"], r:"europe", o:true },
  { c:"arts", l:"medium", t:"Who sculpted the statue of David in Florence?", a:"Michelangelo", w:["Donatello","Bernini","Rodin"], r:"europe", o:true },
  { c:"arts", l:"medium", t:"Which Nigerian playwright was the first African to win the Nobel Prize in Literature?", a:"Wole Soyinka", w:["Chinua Achebe","Naguib Mahfouz","Nadine Gordimer"], r:"africa", o:true },
  { c:"arts", l:"medium", t:"Who wrote 'The Old Man and the Sea'?", a:"Ernest Hemingway", w:["John Steinbeck","F. Scott Fitzgerald","William Faulkner"], r:"na", o:true },
  { c:"arts", l:"medium", t:"Which painter is famous for Campbell's soup cans?", a:"Andy Warhol", w:["Roy Lichtenstein","Jackson Pollock","Keith Haring"], r:"na", o:true },
  { c:"arts", l:"medium", t:"What nationality was the painter Frida Kahlo?", a:"Mexican", w:["Spanish","Argentine","Cuban"], r:"latam", o:true },
  { c:"arts", l:"medium", t:"Who wrote 'Half of a Yellow Sun'?", a:"Chimamanda Ngozi Adichie", w:["Buchi Emecheta","Tsitsi Dangarembga","Bernardine Evaristo"], r:"africa", o:true },
  { c:"arts", l:"hard",   t:"Which art movement did Picasso and Braque found?", a:"Cubism", w:["Surrealism","Fauvism","Futurism"], r:"europe", o:true },
  { c:"arts", l:"hard",   t:"Who wrote 'Don Quixote'?", a:"Miguel de Cervantes", w:["Lope de Vega","Dante Alighieri","Voltaire"], r:"europe", o:true },
  { c:"arts", l:"hard",   t:"Which Japanese author wrote 'Norwegian Wood'?", a:"Haruki Murakami", w:["Yukio Mishima","Kenzaburo Oe","Banana Yoshimoto"], n:true, r:"asia", o:true },
  { c:"arts", l:"hard",   t:"Which 11th-century Japanese work is often called the world's first novel?", a:"The Tale of Genji", w:["The Pillow Book","The Tale of the Heike","Kojiki"], n:true, r:"asia", o:true },
  { c:"arts", l:"hard",   t:"Which Kenyan writer wrote 'Decolonising the Mind'?", a:"Ngugi wa Thiong'o", w:["Ayi Kwei Armah","Nuruddin Farah","Mongo Beti"], n:true, r:"africa", o:true },
  { c:"arts", l:"hard",   t:"Who wrote the poem 'The Raven'?", a:"Edgar Allan Poe", w:["Walt Whitman","Emily Dickinson","Lord Byron"], r:"na", o:true },
  { c:"arts", l:"hard",   t:"The Benin Bronzes were made by artists of which historic kingdom?", a:"The Kingdom of Benin", w:["The Ashanti Kingdom","The Kingdom of Kongo","The Oyo Empire"], n:true, r:"africa", o:true },
  { c:"arts", l:"hard",   t:"Which Egyptian novelist won the Nobel Prize in Literature in 1988?", a:"Naguib Mahfouz", w:["Taha Hussein","Alaa Al Aswany","Tayeb Salih"], n:true, r:"mena", o:true },

  /* ---------- culture ---------- */
  { c:"culture", l:"easy",   t:"What is the main ingredient in guacamole?", a:"Avocado", w:["Cucumber","Courgette","Green pepper"], r:"latam", o:true },
  { c:"culture", l:"easy",   t:"Jollof rice is a signature dish of which region?", a:"West Africa", w:["East Africa","The Caribbean","South Asia"], r:"africa", o:true },
  { c:"culture", l:"easy",   t:"Which drink is made from fermented grapes?", a:"Wine", w:["Beer","Cider","Sake"], r:"global", o:true },
  { c:"culture", l:"easy",   t:"Sushi is a traditional dish of which country?", a:"Japan", w:["China","Korea","Thailand"], r:"asia", o:true },
  { c:"culture", l:"easy",   t:"What is the currency of Nigeria?", a:"The naira", w:["The cedi","The shilling","The rand"], r:"africa", o:true },
  { c:"culture", l:"easy",   t:"Ramadan is a month of what for Muslims?", a:"Fasting", w:["Feasting","Silence","Pilgrimage"], r:"mena", o:true },
  { c:"culture", l:"medium", t:"Which Hindu festival is known as the festival of lights?", a:"Diwali", w:["Holi","Navratri","Onam"], r:"asia", o:true },
  { c:"culture", l:"medium", t:"Which country is the world's largest producer of coffee?", a:"Brazil", w:["Colombia","Ethiopia","Vietnam"], r:"latam", o:true },
  { c:"culture", l:"medium", t:"What is the Japanese art of paper folding called?", a:"Origami", w:["Ikebana","Kirigami","Shodo"], r:"asia", o:true },
  { c:"culture", l:"medium", t:"Which language has the most native speakers?", a:"Mandarin Chinese", w:["English","Spanish","Hindi"], r:"asia", o:true },
  { c:"culture", l:"medium", t:"Mexico's Day of the Dead honours ancestors with which flower?", a:"The marigold", w:["The rose","The lily","The hibiscus"], r:"latam", o:true },
  { c:"culture", l:"medium", t:"What is couscous made from?", a:"Semolina wheat", w:["Rice","Maize","Millet"], r:"mena", o:true },
  { c:"culture", l:"medium", t:"Which spice is the most expensive in the world by weight?", a:"Saffron", w:["Vanilla","Cardamom","Cinnamon"], r:"global", o:true },
  { c:"culture", l:"medium", t:"What is the Islamic pilgrimage to Mecca called?", a:"The Hajj", w:["The Umrah","The Eid","The Zakat"], r:"mena", o:true },
  { c:"culture", l:"medium", t:"Which country does feta cheese come from?", a:"Greece", w:["Italy","Turkey","Bulgaria"], r:"europe", o:true },
  { c:"culture", l:"hard",   t:"Coffee is believed to have originated in which country?", a:"Ethiopia", w:["Yemen","Brazil","Turkey"], r:"africa", o:true },
  { c:"culture", l:"hard",   t:"Which country drinks the most tea per person?", a:"Turkey", w:["China","India","The United Kingdom"], n:true, r:"mena", o:true },
  { c:"culture", l:"hard",   t:"What does the Japanese word 'karaoke' literally mean?", a:"Empty orchestra", w:["Singing box","Loud voice","Night music"], n:true, r:"asia", o:true },
  { c:"culture", l:"hard",   t:"Which Chinese festival is celebrated with dragon boat races?", a:"The Dragon Boat Festival", w:["The Lantern Festival","Mid-Autumn Festival","Qingming"], n:true, r:"asia", o:true },
  { c:"culture", l:"hard",   t:"Which nut is the main ingredient of marzipan?", a:"The almond", w:["The hazelnut","The cashew","The walnut"], r:"europe", o:true },
  { c:"culture", l:"hard",   t:"Kente cloth is a traditional textile of which people?", a:"The Akan of Ghana", w:["The Yoruba of Nigeria","The Maasai of Kenya","The Zulu of South Africa"], n:true, r:"africa", o:true },
  { c:"culture", l:"hard",   t:"Which country celebrates Nowruz as its new year?", a:"Iran", w:["Turkey","Egypt","Pakistan"], n:true, r:"mena", o:true },
  { c:"culture", l:"hard",   t:"Which South American drink is sipped from a gourd through a metal straw?", a:"Mate", w:["Pisco","Chicha","Guarana"], n:true, r:"latam", o:true },

  ];
  globalThis.ANSWER_IT_CURATED = (globalThis.ANSWER_IT_CURATED || []).concat(B);
})();
