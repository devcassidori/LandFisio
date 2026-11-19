# LandFisio — Landing page para fisioterapeuta

Landing page premium para a **Drª Vanessa Oliveira · Fisioterapeuta**, com uma narrativa em 3D controlada pelo scroll: um braço em raio-x com **fratura da cabeça do rádio** que se reconstitui, consolida e volta a se movimentar.

Tudo em **um único arquivo `index.html`**, sem build, sem framework e sem dependências instaladas — as bibliotecas vêm de CDN.

---

## Sumário

- [Como rodar](#como-rodar)
- [Estrutura](#estrutura)
- [Stack](#stack)
- [A cena 3D](#a-cena-3d)
  - [Linha do tempo do scroll](#linha-do-tempo-do-scroll)
  - [Anatomia procedural](#anatomia-procedural)
  - [Shader de raio-x](#shader-de-raio-x)
  - [Efeitos da reconstrução](#efeitos-da-reconstrução)
  - [Câmera](#câmera)
- [Seções da página](#seções-da-página)
- [Responsividade](#responsividade)
- [Acessibilidade e performance](#acessibilidade-e-performance)
- [Personalização](#personalização)
- [Deploy](#deploy)
- [Compatibilidade](#compatibilidade)

---

## Como rodar

Como o JavaScript usa **ES Modules** e **import maps**, a página precisa ser servida por HTTP (abrir o arquivo direto com `file://` pode bloquear os módulos em alguns navegadores).

```bash
npx -y http-server@14.1.1 -p 5180 -c-1
```

Depois abra <http://localhost:5180>.

Qualquer servidor estático funciona (`python -m http.server`, Live Server do VS Code, etc.).

## Estrutura

```
.
├── index.html          # página completa: HTML + CSS + JS (UI e cena 3D)
├── assets/
│   ├── bones.bin       # malhas dos ossos pré-calculadas (≈345 KB, meshoptimizer)
│   └── meshopt-decoder-js.mjs  # decodificador em JS puro, usado só se o host bloquear WebAssembly
├── tools/
│   ├── bones-sdf.mjs   # SDFs que esculpem cada osso (fonte do modelo)
│   ├── bake-bones.mjs  # gera assets/bones.bin
│   └── package.json
└── README.md
```

Dentro do `index.html`:

| Bloco | Conteúdo |
|---|---|
| `<style>` | Tokens de cor/tipografia em `:root`, layout de todas as seções, media queries |
| `<header class="nav">` | Navegação fixa com menu hambúrguer no mobile |
| `<section class="story">` | Seção "pinada" de 520vh com o `<canvas>` 3D, HUD e legendas |
| `<main class="light-wrap">` | Sobre, Especialidades, Método, Depoimentos e FAQ |
| `<section class="cta">` | Chamada final e contato |
| `<script>` (clássico) | UI: texto dividido em palavras, reveals, contadores, navbar, menu |
| `<script type="module">` | Cena Three.js, pós-processamento e animação guiada pelo scroll |

## Stack

| Tecnologia | Uso |
|---|---|
| **Three.js 0.160.0** (jsDelivr, via import map) | Renderização WebGL, geometrias procedurais |
| `EffectComposer` + `UnrealBloomPass` + `OutputPass` | Brilho (bloom) do raio-x |
| `MeshoptDecoder` (addon) | Decodifica as malhas pré-calculadas dos ossos (`assets/bones.bin`); se a CSP do host bloquear WebAssembly, usa `assets/meshopt-decoder-js.mjs` |
| GLSL customizado (`ShaderMaterial`) | Material de raio-x, brilhos e linha do scanner |
| CSS puro | Layout, animações de entrada, grão de filme |
| `IntersectionObserver` | Reveals das seções e pausa da renderização fora da tela |
| Google Fonts | *Instrument Serif* (títulos), *Manrope* (texto), *JetBrains Mono* (HUD) |

Não há GSAP, Lenis ou qualquer biblioteca de scroll: o progresso é calculado manualmente e suavizado com interpolação a cada frame.

## A cena 3D

### Linha do tempo do scroll

O progresso `p ∈ [0, 1]` vem da posição da `.story` na viewport:

```js
p = clamp(-rect.top / (rect.height - innerHeight))
```

e é suavizado com `prog += (target - prog) * 0.075` a cada frame. Todas as animações são funções puras de `p` (com `smoothstep`, `easeInOutCubic` e `easeOutBack`), então rolar para cima reverte tudo perfeitamente.

| `p` | Etapa | O que acontece |
|---|---|---|
| 0.00 – 0.14 | **Hero** | Braço inteiro, scanner varrendo, cabeça do rádio fraturada, foco vermelho pulsando como batimento, fragmento tremendo |
| 0.12 – 0.34 | **01 · Diagnóstico** | Câmera aproxima do cotovelo |
| 0.14 – 0.45 | **Redução** | Fragmentos voltam ao lugar com *overshoot* (`easeOutBack`), estilhaços e partículas convergem |
| ≈ 0.45 | **Fusão** | Clarão, tremida de câmera, pico de bloom e 3 ondas de choque |
| 0.44 – 0.74 | **02 · Reconstrução** | Calo ósseo cresce, brilha em ciano e é "remodelado" |
| 0.64 – 0.92 | **03 · Movimento** | Giro de 360°, flexão do cotovelo, prono-supinação, abrir/fechar a mão |
| 0.86 – 1.00 | **Exercício contínuo** | Rosca bíceps em loop com supinação e punho, vista de perfil |

O HUD (consolidação %, amplitude do cotovelo em graus e status clínico) é derivado dos mesmos valores.

### Anatomia procedural

Os ossos são **esculpidos em código** (`tools/bones-sdf.mjs`) e convertidos em malha **antes do deploy** pelo `tools/bake-bones.mjs`. A página só baixa `assets/bones.bin` e decodifica (≈4 ms):

1. **Campos de distância (SDF)**: cada osso é uma função `d(x, y, z)` montada a partir de primitivas anatômicas — cápsulas cônicas encadeadas (diáfises), elipsoides (cabeças, tubérculos, epicôndilos, ossos do carpo), um "carretel" (tróclea) e um polígono extrudado (lâmina da escápula). As peças são unidas com **união suave** (`smin`) e cavadas com **subtração suave** (fossas, sulco bicipital, incisura troclear, fóvea da cabeça do rádio). Uma leve irregularidade senoidal (`grain`) evita a aparência de CG perfeito.
2. **Amostragem**: cada campo é amostrado numa grade ajustada à caixa do osso, com **banda estreita**: uma grade grossa (passo 4) decide quais células estão perto da superfície; só elas são avaliadas exatamente, o resto é interpolado.
3. **Malha**: o `MarchingCubes` do Three.js gera os triângulos; as normais (gradiente do campo) são corrigidas para a grade esticada.
4. **Otimização**: vértices repetidos são soldados, a malha é simplificada com o `meshoptimizer` (346 mil → 73 mil triângulos, sem diferença visível no shader de raio-x), quantizada (posição 14 bits, normal 8 bits) e comprimida. Ossos iguais (falanges repetidas) são gravados uma vez só.

Antes, esse processo rodava no navegador e custava ~5,5 s de CPU no carregamento (bem mais em celulares). Agora o esqueleto aparece assim que o `bones.bin` chega.

**Mudou a anatomia?** Edite `tools/bones-sdf.mjs` (e as caixas/resoluções em `tools/bake-bones.mjs`, se preciso) e gere de novo:

```bash
cd tools && npm install && npm run bake      # opcional: node bake-bones.mjs 0.3  → mais triângulos
```

As chaves dos ossos (`'humerus'`, `` `hand:${L},${s},${distal}` `` etc.) precisam bater entre o bake e as chamadas `bone3d()` no `index.html`.

- **Membro superior esquerdo** (vista anterior, lateral = +x):
  - Escápula com borda lateral, espinha, acrômio, **processo coracoide**, colo e **cavidade glenoide** escavada pela cabeça do úmero; clavícula em "S";
  - Úmero com cabeça, colo, tubérculos maior/menor, **sulco bicipital**, **tuberosidade deltoide**, crista supracondilar, epicôndilos, **tróclea em carretel**, capítulo e **fossas do olécrano e coronoide**;
  - Ulna com **olécrano e processo coronoide formando a incisura troclear** (cavada pela própria tróclea), incisura radial, crista interóssea e processo estiloide;
  - Rádio com cabeça em disco e **fóvea côncava**, colo, **tuberosidade radial**, crista interóssea, extremidade distal larga com faceta articular e estiloide;
  - 9 ossos do carpo (incluindo pisiforme e hâmulo do hamato), 5 metacarpos e falanges com base, diáfise e cabeça — as falanges distais terminam em **tufo** achatado.
- **Fratura da cabeça do rádio (tipo Mason II)**: a mesma SDF do rádio é cortada por uma superfície serrilhada no colo e a cabeça é dividida por um plano oblíquo irregular — as peças se encaixam exatamente.
- **Hierarquia de articulações**: `girdle → shoulder → elbow → forearm (eixo de prono-supinação) → wrist → dedos (3 falanges com pivô próprio)`. A função `setHand(c)` fecha a mão em punho.
- **Pele** translúcida com perfis de lathe (deltoide, bíceps, massa do antebraço) e cápsulas nos dedos.

### Shader de raio-x

Material único compartilhado por todos os ossos (`makeXray`), com *blending* aditivo e sem escrita de profundidade — por isso as sobreposições somam luz, como num filme radiográfico.

- **Cortical**: `rim = 0.5·f^(p/2) + 0.95·f^(2.2p)`, onde `f = 1 − |N·V|` (fresnel). Resultado: duas linhas claras paralelas nas bordas do osso e o centro mais escuro.
- **Trabecular**: ruído 3D de valor (duas oitavas) em coordenadas do objeto modula a densidade.
- **Foco da lesão**: `uHot` recebe a posição mundial da fratura; um `smoothstep` por distância tinge o osso de vermelho, controlado por `uHeat`.

Brilhos (`makeGlow`) usam o fresnel invertido para um halo suave; o scanner é um plano com gradiente em shader.

### Efeitos da reconstrução

- **Estilhaços**: 16 icosaedros irregulares que partem de posições aleatórias, giram e encolhem até sumir dentro da fratura.
- **Partículas**: 480 pontos que espiralam até um anel ao redor do colo do rádio, mudando de vermelho para ciano.
- **Onda de choque**: 3 toros orientados perpendicularmente ao antebraço (usando o quaternion mundial do marcador), escalonados no tempo.
- **Clarão**: pico gaussiano em `p ≈ 0.452` que aumenta o bloom, o glow, um overlay CSS (`#flash`) e treme a câmera.
- **Calo ósseo**: esfera com o mesmo shader em ciano que surge, pulsa e desaparece (remodelação).

### Câmera

- Distância base calculada para caber o braço inteiro (`D0 = 21` em paisagem, `27` em retrato).
- Em paisagem (`aspect > 1.05`) o braço fica deslocado para a direita, deixando a coluna de texto à esquerda; em retrato fica centralizado e mais alto, com o texto embaixo.
- Zoom para o cotovelo na fase de diagnóstico/reconstrução, reenquadramento na fase de movimento e leve paralaxe com o mouse.

## Efeitos de interface

Inspirados em padrões populares do 21st.dev, mas implementados em HTML/CSS/JS puro (o site não usa React/Tailwind):

| Efeito | Onde | Como |
|---|---|---|
| Barra de progresso de leitura | Topo da página | `#progress` com `scaleX` pelo scroll |
| Texto com brilho | Palavra em destaque do título | Gradiente animado com `background-clip: text` |
| Spotlight | Cards de especialidades e depoimentos (`[data-spot]`) | Gradiente radial que segue o ponteiro via variáveis CSS `--x`/`--y` |
| Borda animada (*border beam*) | Foto e depoimento principal (`.beam`) | `conic-gradient` com ângulo `@property --beam` mascarado na borda |
| Botões magnéticos + reflexo | Botões do hero e do contato | `translate` proporcional ao ponteiro; faixa de luz no hover |
| Aurora | Fundo da seção de contato | Dois gradientes radiais flutuando |
| Pulso nas etapas | Linha do tempo do método | `box-shadow` animado em sequência |

Os efeitos de ponteiro só ligam com mouse (`hover: hover` e `pointer: fine`); em telas de toque os estados de hover não "grudam". Todos respeitam `prefers-reduced-motion`.

## Seções da página

1. **Hero / história em 3D** — com HUD estilo exame de imagem e legendas que aparecem por faixa de scroll (`data-in` / `data-out`).
2. **Sobre** — foto (placeholder), bio, contadores animados e assinatura.
3. **Especialidades** — 6 cards com ícones SVG e hover invertido.
4. **Método** — linha do tempo em 4 etapas com preenchimento animado.
5. **Depoimentos** — 3 cards.
6. **FAQ** — `<details>` nativos estilizados.
7. **Contato** — CTA, WhatsApp, endereço, horários e rodapé.
8. **Botão flutuante de WhatsApp** — aparece só depois da animação 3D.

## Responsividade

Testado em 320×640, 375×812, 768×1024, 1024×768, 780×360 (celular deitado), 1280×720, 1440×900 e 1920×1080, sem rolagem horizontal. Alvos de toque dos links do rodapé têm no mínimo 44px.

| Breakpoint | Ajustes |
|---|---|
| `max-aspect-ratio: 1/1` (retrato) | Legendas descem para a parte inferior, braço centralizado e mais alto, medidores ocultos |
| `retrato + max-height: 720px` | Tipografia e espaçamentos das legendas compactados |
| `landscape + max-height: 540px` | Celular deitado: legendas à esquerda em tamanho reduzido, HUD superior oculto |
| `max-width: 900px` | Menu hambúrguer em tela cheia (fecha com clique, `Esc` ou ao redimensionar), grids de 1–2 colunas |
| `max-width: 480px` | Botão "Agendar" curto, HUD superior oculto, cards e números compactos |
| `max-width: 340px` | Botão da navbar oculto (o menu e o hero já têm o CTA) |
| `> 1440px` | Conteúdo limitado a 1440px e centralizado |

Outros detalhes: `100svh` na seção fixa (barra de endereço do mobile), `ResizeObserver` no canvas, `devicePixelRatio` limitado a 2.

## Acessibilidade e performance

- `prefers-reduced-motion`: sem suavização, sem partículas, sem tremor, sem grão animado e sem animações de entrada.
- Loop 3D inteiro (cálculos + renderização) pausado quando a seção sai da tela (`IntersectionObserver`).
- Malhas dos ossos pré-calculadas e comprimidas (`assets/bones.bin`, pré-carregado com `<link rel="preload">`), sem processamento pesado no carregamento.
- Fallback sem WebGL: a classe `no-webgl` esconde o canvas e mostra um fundo estático.
- Menu com `aria-expanded`/`aria-controls`, links com foco nativo, canvas com `aria-hidden`.
- Proteção contra `NaN` no progresso quando a viewport ainda não tem altura (abas em segundo plano).

## Personalização

| O quê | Onde |
|---|---|
| Nome, CREFITO, contatos, endereço | Busque por `Vanessa Oliveira`, `CREFITO`, `wa.me`, `Rua Exemplo` |
| Foto | Troque `<div class="ph">VO</div>` por `<img src="foto.jpg" alt="…">` dentro de `.portrait` |
| Cores | Variáveis em `:root` (`--ice`, `--heat`, `--paper`, `--navy`…) |
| Duração da história | Altura de `.story` (`520vh`) |
| Momentos da animação | Faixas `smooth(a, b, p)` dentro de `frame()` |
| Brilho do raio-x | `makeXray(cor, base, borda, potência, ruído)` e `UnrealBloomPass(…, força, raio, limiar)` |
| Textos das etapas | Blocos `.cap` com `data-in` / `data-out` |

> Os números da seção "Sobre", os depoimentos e os dados de contato são **exemplos** e devem ser substituídos por informações reais antes da publicação.

## Deploy

Por ser um único HTML estático, basta publicar o arquivo em qualquer hospedagem estática:

- **GitHub Pages**: *Settings → Pages → Deploy from a branch → `main` / root*.
- **Netlify / Vercel / Cloudflare Pages**: arrastar a pasta ou conectar o repositório, sem comando de build.

## Compatibilidade

Navegadores com WebGL 2 e suporte a import maps: Chrome/Edge 89+, Firefox 108+, Safari 16.4+ (desktop e iOS).
