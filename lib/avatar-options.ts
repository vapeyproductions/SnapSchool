export const AVATAR_OPTIONS = [
  { id: "avery", label: "Avery", seed: "Avery Rivera" },
  { id: "bailey", label: "Bailey", seed: "Bailey Brooks" },
  { id: "cameron", label: "Cameron", seed: "Cameron Ellis" },
  { id: "dakota", label: "Dakota", seed: "Dakota Morgan" },
  { id: "emery", label: "Emery", seed: "Emery Chen" },
  { id: "finley", label: "Finley", seed: "Finley Singh" },
  { id: "gray", label: "Gray", seed: "Gray Johnson" },
  { id: "harper", label: "Harper", seed: "Harper Okafor" },
  { id: "indigo", label: "Indigo", seed: "Indigo Martinez" },
  { id: "jordan", label: "Jordan", seed: "Jordan Kim" },
  { id: "kai", label: "Kai", seed: "Kai Williams" },
  { id: "logan", label: "Logan", seed: "Logan Patel" },
  { id: "morgan", label: "Morgan", seed: "Morgan Davis" },
  { id: "nova", label: "Nova", seed: "Nova Garcia" },
  { id: "parker", label: "Parker", seed: "Parker Wilson" },
  { id: "quinn", label: "Quinn", seed: "Quinn Thompson" },
  { id: "riley", label: "Riley", seed: "Riley Brown" },
  { id: "sage", label: "Sage", seed: "Sage Anderson" },
  { id: "taylor", label: "Taylor", seed: "Taylor Nguyen" },
  { id: "winter", label: "Winter", seed: "Winter Robinson" },
] as const;

export const buildAvatarUrl = (baseUrl: string, seed: string) =>
  `${baseUrl}${encodeURIComponent(seed)}`;

export const getAvatarChoices = (baseUrl: string) =>
  AVATAR_OPTIONS.map((option) => ({
    ...option,
    url: buildAvatarUrl(baseUrl, option.seed),
  }));

export const isAvatarChoice = (baseUrl: string, photoURL: string) =>
  getAvatarChoices(baseUrl).some((option) => option.url === photoURL);
