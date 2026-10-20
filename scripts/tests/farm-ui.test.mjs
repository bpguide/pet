import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const view = readFileSync(new URL('../../tools/qqfarm/src/com/MyFarm/view/InstallFace.as', import.meta.url), 'utf8')
const tools = readFileSync(new URL('../../tools/qqfarm/src/com/MyFarm/control/ToolsBarControl.as', import.meta.url), 'utf8')
const shop = readFileSync(new URL('../../tools/qqfarm/src/com/MyFarm/Store/view/ShowBox.as', import.meta.url), 'utf8')
const store = readFileSync(new URL('../../tools/qqfarm/src/com/MyFarm/Store/MyStore.as', import.meta.url), 'utf8')
const scrollbar = readFileSync(new URL('../../tools/qqfarm/props-src/com/UIComponents/ScrollBar/SaltedFishScrollBar.as', import.meta.url), 'utf8')
const title = readFileSync(new URL('../../tools/qqfarm/src/com/MyFarm/control/TitleControl.as', import.meta.url), 'utf8')
const itemCard = readFileSync(new URL('../../tools/qqfarm/props-src/ItemBg.as', import.meta.url), 'utf8')

// Execute the patched AS3 methods; their display-list arithmetic also runs as TypeScript.
function method(source, name, context) {
  const start = source.indexOf(`function ${name}(`)
  const body = source.indexOf('{', start)
  let end = body + 1, depth = 1
  while (depth) { if (source[end] === '{') depth++; if (source[end++] === '}') depth-- }
  const code = source.slice(start, end)
    .replace(/for each\(var (\w+):\w+ in ([^)]+)\)/g, 'for (const $1 of $2)')
    .replace(/:(Number|uint)\b/g, ':number')
  return runInNewContext(stripTypeScriptTypes(code) + `;${name}`, Object.assign(context, { int: Math.trunc }))
}

class Sprite {
  children = []
  x = 0; y = 0; width = 60; height = 60
  txt = {}
  addChild(child) { this.children.push(child); return child }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1) }
  getChildByName(name) { return this.children.find(child => child.name === name) ?? null }
  addEventListener() {}
}

function display() {
  const bar = Object.assign(new Sprite(), { name: 'ToolBarBg', width: 380, height: 40 })
  const pack = Object.assign(new Sprite(), { name: 'PackBarBg', visible: false })
  pack.addChild(Object.assign(new Sprite(), { name: 'background' }))
  const _tools = new Sprite(); _tools.addChild(bar); _tools.addChild(pack)
  return { _tools, pack, Sprite, _stage: { stageWidth: 700, stageHeight: 550, addChild() {} },
    createClip: name => Object.assign(new Sprite(), name === 'ToolBarBg' ? { width: 380, height: 40 } : {}),
    createButton: () => new Sprite(), IntroductionText: function () {} }
}

test('toolbar stays centred and every inventory card fits the stage, including wrapped rows and refreshes', () => {
  for (const count of [0, 1, 6, 10, 14, 25]) {
    const context = { ...display(), _user: { burden: Array.from({ length: count }, (_, i) => ({ Items: `Seed${i}`, number: 10 })) } }
    context._tools = new Sprite()
    context.showBurden = method(view, 'showBurden', context)
    method(view, 'installToolsBar', context)()
    const { _tools } = context
    assert.equal(_tools.x + _tools.getChildByName('ToolBarBg').width / 2, 350)
    const pack = _tools.getChildByName('PackBarBg')
    pack.visible = true
    context.showBurden()
    const cards = pack.getChildByName('container').children
    assert.equal(cards.length, count)
    for (const card of cards) {
      const x = _tools.x + pack.x + card.x, y = _tools.y + pack.y + card.y
      assert.ok(x >= 10 && x + card.width <= 690, `card ${card.name} fits horizontally`)
      assert.ok(y >= 80 && y + card.height < _tools.y, `card ${card.name} fits above the tools`)
      assert.equal(card.mouseChildren, false)
    }
    assert.equal(pack.visible, true)
  }
})

test('pack remains open through its own presses, selects late items, and closes on an outside press', () => {
  const { pack, _tools } = display()
  const face = { _tools, _myMouse: {}, changeMouse(name) { this._myMouse.name = name } }
  _tools.contains = target => target.inside
  const context = { face, Mouse: { show() {} } }
  const press = method(tools, 'clickHandler', context)
  const select = method(tools, 'toolsSelected', context)
  for (const name of ['PeachSeed', 'WatermelonSeed', 'BananaSeed', 'FertilizerVeryFastP']) {
    select({ target: { name: 'ButtonSeed' } })
    press({ target: { name, inside: true } })
    assert.equal(pack.visible, true)
    select({ target: { name } })
    assert.equal(face._myMouse.name, name)
    assert.equal(pack.visible, false)
  }
  select({ target: { name: 'ButtonSeed' } })
  press({ target: { inside: false } })
  assert.equal(pack.visible, false)
  assert.doesNotMatch(tools, /addEventListener\(MouseEvent\.ROLL_OUT,mouseOutHandler/)
})

test('both shop tabs show five cards per row without clipping, including after reopening', () => {
  for (const widths of [[52, 60, 64, 79, 86], Array(25).fill(52)]) {
    const cards = widths.map((width, i) => ({ scaleX: 1, scaleY: 1,
      get width() { return width * this.scaleX }, get height() { return (70 + i % 2 * 6) * this.scaleY } }))
    const context = { margins: 20,
      container: { numChildren: cards.length, getChildAt: i => cards[i] },
      myBox: { width: 400, scaleX: 1, scrollBar: { x: 10, width: 380 } } }
    const layout = method(store, 'layoutItems', context)
    layout(74)
    const positions = cards.map(card => [card.x, card.y])
    for (const card of cards) {
      assert.ok(card.x >= 20 && card.x + card.width <= 380, 'every icon and price fits inside the viewport')
      assert.ok(card.y >= 74)
    }
    for (let row = 0; row < cards.length / 5; row++) {
      const line = cards.slice(row * 5, row * 5 + 5)
      assert.equal(new Set(line.map(card => card.y)).size, 1, 'all five cards share one row')
      for (let i = 1; i < line.length; i++) assert.ok(line[i].x > line[i - 1].x + line[i - 1].width, 'prices do not overlap')
      if (row) assert.ok(line[0].y > cards[(row - 1) * 5].y + cards[(row - 1) * 5].height)
    }
    for (const scale of [0.2, 1]) {
      context.myBox.width = 600 * scale
      context.myBox.scaleX = scale
      layout(74)
      assert.deepEqual(cards.map(card => [card.x, card.y]), positions, 'content bounds and opening scale cannot change the grid')
    }
  }
})

test('shop wheel scrolling clamps at both ends and stays in sync with a dragged thumb', () => {
  const context = { target: { height: 900, y: 0 }, myMask: { height: 300 }, startY: 0,
    bg: { height: 300 }, up_btn: { y: 0, height: 10 }, down_btn: { height: 10 }, handler: { height: 100, y: 10 } }
  context.enterFrameHandler = method(scrollbar, 'enterFrameHandler', context)
  const wheel = method(scrollbar, 'wheelHandler', context)
  const roll = delta => wheel({ delta, stopPropagation() {} })
  roll(-3); assert.equal(context.target.y, -90)
  roll(3); assert.equal(context.target.y, 0)
  roll(-100); assert.equal(context.target.y, -600)
  roll(100); assert.equal(context.target.y, 0)
  context.handler.y = 100
  context.enterFrameHandler(null)
  assert.equal(context.target.y, -300)
  roll(3); assert.equal(context.target.y, -210)
  context.target.height = 200
  context.target.y = 0
  roll(-3); assert.equal(context.target.y, 0, 'a list that fits must not scroll')
})

test('warehouse and inventory cards leave enough text space for complete stock counts on one line', () => {
  const counts = [9, 99, 124, 1673, 99999, 1000000000]
  const warehouse = Object.assign(new Sprite(), { width: 500, worth_txt: {} })
  const screen = display()
  const context = { ...screen, _stage: { ...screen._stage, getChildByName: () => warehouse },
    _user: { warehouse: counts.map(number => ({ fruit: 'RadishSeed', number, price: 18 })), burden: counts.map(number => ({ Items: 'RadishSeed', number })) },
    createClip(name) {
      if (name !== 'ItemBg') return screen.createClip(name)
      const clip = new Sprite()
      clip.txt = { value: '', get text() { return this.value }, set text(value) { this.value = String(value) },
        wordWrap: true, multiline: true, get textWidth() { return this.text.length * 6 },
        get width() { return !this.wordWrap && this.autoSize === 'right' ? this.textWidth + 4 : 14 } }
      method(itemCard.replace('super();', ''), 'ItemBg', { txt: clip.txt })()
      return clip
    } }
  method(view, 'showWarehouse', context)()
  method(view, 'showBurden', context)()
  for (const cards of [warehouse.getChildByName('container').children, screen.pack.getChildByName('container').children]) {
    for (const [i, card] of cards.entries()) {
      assert.equal(card.txt.text, String(counts[i]))
      assert.ok(card.txt.width >= card.txt.textWidth, 'all digits fit instead of clipping to two')
      assert.equal(card.txt.multiline, false, 'the count stays on a single line')
    }
  }
})

function warehouseSale(stock) {
  const control = { addEventListener() {}, removeEventListener() {} }
  const stepper = { maximum: 99, minimum: 1, textField: { ...control, text: '1' }, _value: 1,
    set value(v) { this._value = Math.max(this.minimum, Math.min(this.maximum, v)); this.textField.text = String(this._value) },
    get value() { return this._value }, ...control }
  const dialog = { ...control, x: 0, y: 0, width: 300, height: 250, stepper, price_txt: {}, total_txt: {}, txt: {}, title_txt: {},
    define: control, cancel: control, close_btn: control }
  const tip = { num_txt: {}, price_txt: {}, name_txt: {}, define: control, close_btn: control }
  const context = { num: 0, Event: { CHANGE: 'change' }, TextEvent: { TEXT_INPUT: 'textInput' }, MouseEvent: { CLICK: 'click' },
    face: { _user: { wealth: '16000', warehouse: [{ number: stock, price: 18, name: '白萝卜', fruit: 'RadishSeed' }] },
      _stage: new Sprite(), _warehouse: { x: 100, y: 100, width: 500, height: 300, ask_btn: {} },
      getChild: name => name === 'box' ? dialog : name === 'Tips' ? tip : { width: 50, height: 50 },
      showWarehouse() {}, changeExp() {} },
    stepperInputHandler() {}, stepperEnterFrame() {}, tipsCloseHandler() {},
    showBoxClose() { context.showBox = null } }
  dialog.addChild = () => {}
  context.saleQuantity = method(title, 'saleQuantity', context)
  context.stepperChange = method(title, 'stepperChange', context)
  context.soldHandler = method(title, 'soldHandler', context)
  method(title, 'warehouseClickHandler', context)({ target: { name: 'bg0' } })
  return { context, dialog, tip }
}

test('warehouse sale opens at the actual stock count and settles the selected quantity, independently of displayed totals', () => {
  for (const stock of [1, 99, 124, 1673, 99999]) {
    const { dialog } = warehouseSale(stock)
    assert.equal(dialog.stepper.value, stock, 'initial value must not be clamped to the symbol default of 99')
    assert.equal(dialog.stepper.textField.text, String(stock))
    assert.ok(dialog.stepper.textField.maxChars >= String(stock).length, 'manual entry accepts the full stock count')
    assert.equal(dialog.total_txt.text, `${stock * 18}元宝`)
  }
  for (const [input, quantity] of [['99', 99], ['1000', 1000], ['100000', 1673], ['9999999999', 1673], ['', 1], ['0', 1], ['-1', 1], ['invalid', 1]]) {
    const { context, dialog, tip } = warehouseSale(1673)
    dialog.stepper.textField.text = input
    context.stepperChange(null)
    assert.equal(dialog.total_txt.text, `${quantity * 18}元宝`)
    // Even a stale or altered label cannot change what is sold.
    dialog.total_txt.text = '30114元宝'
    context.soldHandler(null)
    assert.equal(Number(context.face._user.wealth), 16000 + quantity * 18)
    assert.equal(context.face._user.warehouse[0]?.number ?? 0, 1673 - quantity)
    assert.equal(tip.num_txt.text, String(quantity))
    assert.equal(tip.price_txt.text, quantity * 18)
  }
})

test('shop releases the shared purchase dialog even when closing interrupts its opening tween', () => {
  for (const preview of ['img', 'displayObject']) {
    for (const opened of [false, true]) {
      const stage = {
        children: [],
        addChild(child) { this.children.push(child); child.parent = this },
        removeChild(child) {
          assert.equal(child.parent, this, 'only attached children can be removed')
          this.children.splice(this.children.indexOf(child), 1)
          child.parent = null
        },
      }
      const mc = { ...stage, children: [], x: 200, y: 100, width: 300, height: 330 }
      stage.addChild(mc)
      const image = { parent: null }
      if (opened) mc.addChild(image)
      const bg = opened ? { parent: null } : null
      if (bg) stage.addChild(bg)
      const tweens = []
      const context = {
        mc, img: null, displayObject: null, [preview]: image, bg, busy: false,
        _width: 300, _height: 330, _x: 200, _y: 100,
        Tweener: { addTween(_target, tween) { tweens.push(tween) } },
        beginComplete() {}, release() { context.released = true },
      }
      context.endComplete = method(shop, 'endComplete', context)
      method(shop, 'beginShow', context)()
      assert.equal(context.busy, true)
      // Purchase and cancel both close the dialog, possibly before beginComplete runs.
      method(shop, 'closeClick', context)()
      tweens.at(-1).onComplete()
      assert.equal(context.busy, false, `${preview}: the next product can be selected`)
      assert.equal(context.released, true)
      assert.equal(stage.children.length, 0, 'dialog and click-blocking backdrop are removed')
      assert.equal(mc.scaleX, 1)
      assert.equal(mc.scaleY, 1)
    }
  }
})

class Rectangle {
  constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }) }
  get right() { return this.x + this.width }
  get bottom() { return this.y + this.height }
  union(other) {
    const x = Math.min(this.x, other.x), y = Math.min(this.y, other.y)
    return new Rectangle(x, y, Math.max(this.right, other.right) - x, Math.max(this.bottom, other.bottom) - y)
  }
  inflate(x, y) { this.x -= x; this.y -= y; this.width += 2 * x; this.height += 2 * y }
}

test('overview fits all 18 plots above the tools and restores after the original-size view', () => {
  const plots = Array.from({ length: 18 }, (_, i) => new Rectangle(254 - i % 3 * 103 + Math.floor(i / 3) * 100, 284 + Math.floor(i / 3) * 50 + i % 3 * 53, 200, 100))
  const context = { ...display(), Rectangle, _bg: {}, _beijing: { x: -15, y: 0, width: 1000, height: 800 },
    _farmland_array: plots.map(plot => ({ getBounds: () => new Rectangle(plot.x, plot.y, plot.width, plot.height) })) }
  context._tools.y = 500
  context.fitFarm = method(view, 'fitFarm', context)
  context.fitFarm()
  for (const plot of plots) {
    const { _bg } = context
    assert.ok(_bg.x + plot.x * _bg.scaleX >= 10)
    assert.ok(_bg.x + plot.right * _bg.scaleX <= 690)
    assert.ok(_bg.y + (plot.y - 45) * _bg.scaleY >= 80)
    assert.ok(_bg.y + plot.bottom * _bg.scaleY < context._tools.y - 20)
  }
  const zoom = context._bg.scaleX
  const toggle = method(view, 'toggleFarmView', context)
  toggle(); assert.equal(context._bg.scaleX, 1)
  toggle(); assert.equal(context._bg.scaleX, zoom)
})
