const games = [
  {
    name: '2048 · 方格工坊',
    sortKey: '2048 fang ge gong fang',
    href: './2048/',
    icon: '/grid2048/card.png',
  },
  {
    name: '合成大西瓜',
    sortKey: 'he cheng da xi gua',
    href: './dxg/',
    icon: '/fruits/fruit_11.png',
  },
  {
    name: '合成大西瓜 · 果园版',
    sortKey: 'he cheng da xi gua guo yuan ban',
    href: './watermelon-orchard/',
    icon: '/orchard/card.png',
  },
];

const catalog = document.getElementById('catalog')!;
const cardTemplate = document.querySelector<HTMLTemplateElement>('#game-card')!;
const collator = new Intl.Collator('en', { sensitivity: 'base' });
const groups = new Map<string, typeof games>();

games.sort((first, second) => collator.compare(first.sortKey, second.sortKey));
games.forEach((game) => {
  const initial = game.sortKey.charAt(0).toUpperCase();
  const letter = /^[A-Z]$/.test(initial) ? initial : '#';
  const group = groups.get(letter) ?? [];
  group.push(game);
  groups.set(letter, group);
});

groups.forEach((group, letter) => {
  const section = document.createElement('section');
  section.className = 'game-group';

  const heading = document.createElement('h2');
  heading.className = 'game-group-title';
  heading.id = `game-group-${letter === '#' ? 'other' : letter.toLowerCase()}`;
  heading.textContent = letter;
  section.setAttribute('aria-labelledby', heading.id);

  const list = document.createElement('ul');
  list.className = 'game-grid';
  group.forEach((game) => {
    const card = cardTemplate.content.cloneNode(true) as DocumentFragment;
    card.querySelector('a')!.href = game.href;
    card.querySelector('.game-card-name')!.textContent = game.name;
    const icon = new Image(56, 56);
    icon.alt = '';
    icon.src = game.icon;
    card.querySelector('.game-card-icon')!.append(icon);
    list.append(card);
  });

  section.append(heading, list);
  catalog.append(section);
});

export {};
