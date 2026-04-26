// All 39 books of Tanakh - reference data
export const ALL_TANAKH_BOOKS = [
  // Torah
  {id:"bereshit",name:"בראשית",emoji:"🌍",section:"תורה"},
  {id:"shemot",name:"שמות",emoji:"🔥",section:"תורה"},
  {id:"vayikra",name:"ויקרא",emoji:"🐂",section:"תורה"},
  {id:"bamidbar",name:"במדבר",emoji:"🏕️",section:"תורה"},
  {id:"devarim",name:"דברים",emoji:"📜",section:"תורה"},
  // Nevi'im Rishonim
  {id:"yehoshua",name:"יהושע",emoji:"⚔️",section:"נביאים ראשונים"},
  {id:"shoftim",name:"שופטים",emoji:"🦁",section:"נביאים ראשונים"},
  {id:"shmuel_a",name:"שמואל א",emoji:"👑",section:"נביאים ראשונים"},
  {id:"shmuel_b",name:"שמואל ב",emoji:"🏛️",section:"נביאים ראשונים"},
  {id:"melachim_a",name:"מלכים א",emoji:"💎",section:"נביאים ראשונים"},
  {id:"melachim_b",name:"מלכים ב",emoji:"⚡",section:"נביאים ראשונים"},
  // Nevi'im Acharonim
  {id:"yeshayahu",name:"ישעיהו",emoji:"📖",section:"נביאים אחרונים"},
  {id:"yirmiyahu",name:"ירמיהו",emoji:"😢",section:"נביאים אחרונים"},
  {id:"yechezkel",name:"יחזקאל",emoji:"👁️",section:"נביאים אחרונים"},
  {id:"hoshea",name:"הושע",emoji:"💗",section:"תרי עשר"},
  {id:"yoel",name:"יואל",emoji:"🌾",section:"תרי עשר"},
  {id:"amos",name:"עמוס",emoji:"🐑",section:"תרי עשר"},
  {id:"ovadia",name:"עובדיה",emoji:"🗻",section:"תרי עשר"},
  {id:"yona",name:"יונה",emoji:"🐋",section:"תרי עשר"},
  {id:"micha",name:"מיכה",emoji:"🌟",section:"תרי עשר"},
  {id:"nachum",name:"נחום",emoji:"💧",section:"תרי עשר"},
  {id:"chavakuk",name:"חבקוק",emoji:"⚖️",section:"תרי עשר"},
  {id:"tzefania",name:"צפניה",emoji:"🕯️",section:"תרי עשר"},
  {id:"chagai",name:"חגי",emoji:"🔨",section:"תרי עשר"},
  {id:"zechariah",name:"זכריה",emoji:"🌅",section:"תרי עשר"},
  {id:"malachi",name:"מלאכי",emoji:"✨",section:"תרי עשר"},
  // Ketuvim
  {id:"tehilim",name:"תהילים",emoji:"🎵",section:"כתובים"},
  {id:"mishlei",name:"משלי",emoji:"💡",section:"כתובים"},
  {id:"iyov",name:"איוב",emoji:"😔",section:"כתובים"},
  {id:"shir",name:"שיר השירים",emoji:"🌹",section:"כתובים"},
  {id:"rut",name:"רות",emoji:"🌾",section:"כתובים"},
  {id:"eicha",name:"איכה",emoji:"💧",section:"כתובים"},
  {id:"kohelet",name:"קהלת",emoji:"⏳",section:"כתובים"},
  {id:"esther",name:"אסתר",emoji:"👸",section:"כתובים"},
  {id:"daniel",name:"דניאל",emoji:"🦁",section:"כתובים"},
  {id:"ezra",name:"עזרא",emoji:"📜",section:"כתובים"},
  {id:"nechemya",name:"נחמיה",emoji:"🧱",section:"כתובים"},
  {id:"divrei_a",name:"דברי הימים א",emoji:"📚",section:"כתובים"},
  {id:"divrei_b",name:"דברי הימים ב",emoji:"📚",section:"כתובים"},
];

export const BOOK_BY_ID = Object.fromEntries(ALL_TANAKH_BOOKS.map(b => [b.id, b]));
