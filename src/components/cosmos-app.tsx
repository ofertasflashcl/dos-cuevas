import { useEffect, useRef, useState } from "react";
import { Eye, MessageCircle, Orbit, Pause, Play, ScrollText, Shield, Sparkles } from "lucide-react";
import { loadArt, type Art } from "@/cosmos/art";
import { clamp, wrap, wrapDelta } from "@/cosmos/geo";
import { columnRise, draw, focusSite, hitActor, hitPlanet, type Cam, type Room, type Screen } from "@/cosmos/draw";
import { KIND_LABEL, LAW_LABEL, ROLE_LABEL, eraName } from "@/cosmos/names";
import type { World } from "@/cosmos/types";
import {
  ageWord,
  awaken,
  beastLine,
  blurb,
  generate,
  intervene,
  kinOf,
  loadSave,
  looks,
  mind,
  relWord,
  restore,
  tickDay,
  writeSave,
  WORK_NAME,
} from "@/cosmos/sim";
import { createAudio } from "@/empire/audio";

type Sel = { kind: "person" | "civ" | "fauna"; id: number } | null;

type Keys = { left: boolean; right: boolean; up: boolean; down: boolean };

const EMPTY_KEYS: Keys = { left: false, right: false, up: false, down: false };

function Pip({ on }: { on: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-sm ${on ? "bg-gold" : "bg-line"}`} />;
}

export function CosmosApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const artRef = useRef<Art | null>(null);
  const camRef = useRef<Cam>({ x: 40, y: 40, zoom: 12 });
  const keysRef = useRef<Keys>({ ...EMPTY_KEYS });
  const screenRef = useRef<Screen>("sistema");
  const speedRef = useRef(1);
  const heldRef = useRef(1);
  const selRef = useRef<Sel>(null);
  const followRef = useRef<number | null>(null);
  const audioRef = useRef<ReturnType<typeof createAudio> | null>(null);
  const insideRef = useRef<Room | null>(null);
  const stillRef = useRef(false);
  const [inside, setInside] = useState<Room | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("sistema");
  const [day, setDay] = useState(0);
  const [attention, setAttention] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [coached, setCoached] = useState(true);
  const [sel, setSel] = useState<Sel>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const world = worldRef.current;

  const sync = () => setRev((n) => n + 1);

  const goScreen = (next: Screen) => {
    screenRef.current = next;
    setScreen(next);
  };

  const applySpeed = (n: number) => {
    speedRef.current = n;
    if (n > 0) heldRef.current = n;
    setSpeed(n);
  };

  useEffect(() => {
    let dead = false;
    let frame = 0;
    stillRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    audioRef.current = createAudio();
    const boot = async () => {
      const art = await loadArt();
      if (dead) return;
      const saved = loadSave();
      let next = saved ? restore(saved) : null;
      if (!next) {
        next = generate((Math.random() * 1e9) >>> 0 || 1);
        awaken(next);
        writeSave(next);
      }
      worldRef.current = next;
      artRef.current = art;
      const home = focusSite(next);
      camRef.current.x = home.x;
      camRef.current.y = home.y;
      camRef.current.zoom = window.innerWidth < 720 ? 20 : 16;
      setDay(next.day);
      setAttention(next.attention);
      setCoached(next.coached);
      setReady(true);
    };
    void boot();

    let acc = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const current = worldRef.current;
      const art = artRef.current;
      const canvas = canvasRef.current;
      if (!current || !art || !canvas) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cam = camRef.current;
      const keys = keysRef.current;
      if (screenRef.current === "planeta") {
        if (keys.left) cam.x -= dt * 36;
        if (keys.right) cam.x += dt * 36;
        if (keys.up) cam.y -= dt * 28;
        if (keys.down) cam.y += dt * 28;
        const follow = followRef.current;
        if (follow != null) {
          const p = current.people.find((person) => person.id === follow && person.alive);
          if (!p || p.planet !== current.focusPlanet) followRef.current = null;
          else {
            const dx = p.x - cam.x;
            const home = current.planets[p.planet];
            const gy = home ? p.y - columnRise(home, p.x, p.y) : p.y;
            cam.x += dx * 0.15;
            cam.y += (gy - cam.y) * 0.15;
          }
        }
      } else if (keys.left) current.angle -= dt * 0.55;
      else if (keys.right) current.angle += dt * 0.55;

      if (speedRef.current > 0) {
        acc += (dt * speedRef.current) / 8;
        let steps = Math.min(4, Math.floor(acc));
        acc -= steps;
        current.frac = acc;
        const before = current.day;
        while (steps--) tickDay(current);
        if (current.day !== before && current.day % 10 === 0) writeSave(current);
        if (current.ping) {
          const ping = current.ping;
          current.ping = null;
          audioRef.current?.play(ping === "hit" ? "hit" : ping === "era" ? "era" : "spin");
        }
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      if (canvas.width !== Math.floor(vw * dpr) || canvas.height !== Math.floor(vh * dpr)) {
        canvas.width = Math.max(1, Math.floor(vw * dpr));
        canvas.height = Math.max(1, Math.floor(vh * dpr));
      }
      const ctx = canvas.getContext("2d");
      if (!ctx || vw < 2 || vh < 2) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const selNow = selRef.current;
      const mark = selNow && selNow.kind !== "civ" ? { kind: selNow.kind, id: selNow.id } : null;
      draw(ctx, art, current, cam, screenRef.current === "cronica" ? "sistema" : screenRef.current, vw, vh, now / 1000, stillRef.current, dpr, insideRef.current, mark);
      if (now - lastUi > 280) {
        lastUi = now;
        setDay(current.day);
        setAttention(current.attention);
      }
    };
    frame = requestAnimationFrame(loop);

    const probe = {
      setKeys(partial: Partial<Keys>) {
        keysRef.current = { ...keysRef.current, ...partial };
      },
      getCam: () => ({ ...camRef.current }),
      getDay: () => worldRef.current?.day ?? 0,
      getLogs: () => worldRef.current?.logs.map((l) => l.text) ?? [],
      get ready() {
        return worldRef.current != null;
      },
    };
    window.__cosmos = probe;

    const onKey = (e: KeyboardEvent) => {
      const down = e.type === "keydown";
      const map: Record<string, keyof Keys> = {
        a: "left",
        arrowleft: "left",
        d: "right",
        arrowright: "right",
        w: "up",
        arrowup: "up",
        s: "down",
        arrowdown: "down",
      };
      const slot = map[e.key.toLowerCase()];
      if (slot) {
        keysRef.current[slot] = down;
        if (down) followRef.current = null;
      }
      if (down && e.code === "Space") {
        e.preventDefault();
        applySpeed(speedRef.current === 0 ? heldRef.current : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      if (window.__cosmos === probe) delete window.__cosmos;
    };
  }, []);

  const openPlanet = (id: number) => {
    const current = worldRef.current;
    if (!current) return;
    current.focusPlanet = id;
    const civ = current.civs.find((c) => c.planet === id);
    if (civ) current.focusCiv = civ.id;
    current.visited += 1;
    const site = focusSite(current);
    camRef.current.x = site.x;
    camRef.current.y = site.y;
    camRef.current.zoom = window.innerWidth < 720 ? 20 : 16;
    followRef.current = null;
    selRef.current = null;
    setSel(null);
    goScreen("planeta");
    writeSave(current);
    sync();
  };

  const act = (kind: "favor" | "escudo" | "rumor" | "chispa") => {
    const current = worldRef.current;
    const selected = selRef.current;
    if (!current || !selected) return;
    audioRef.current?.unlock();
    const err = intervene(current, kind, selected.id);
    if (err) setNote(err);
    else {
      setNote(null);
      writeSave(current);
      setAttention(current.attention);
    }
    sync();
  };

  const another = () => {
    const current = worldRef.current;
    if (!current) return;
    const att = current.attention;
    const visited = current.visited;
    const taught = current.coached;
    const next = generate((Math.random() * 1e9) >>> 0 || 1);
    awaken(next);
    next.attention = att;
    next.visited = visited;
    next.coached = taught;
    worldRef.current = next;
    const site = focusSite(next);
    camRef.current.x = site.x;
    camRef.current.y = site.y;
    selRef.current = null;
    setSel(null);
    setConfirmNew(false);
    goScreen("sistema");
    writeSave(next);
    sync();
  };

  const dismissCoach = () => {
    const current = worldRef.current;
    if (!current) return;
    current.coached = true;
    setCoached(true);
    writeSave(current);
  };

  const planet = world?.planets[world.focusPlanet];
  const civsHere = world?.civs.filter((c) => c.planet === world.focusPlanet) ?? [];
  const selectedPerson = sel?.kind === "person" ? world?.people.find((p) => p.id === sel.id) : undefined;
  const selectedFauna = sel?.kind === "fauna" ? world?.fauna.find((f) => f.id === sel.id) : undefined;
  const kin = world && selectedPerson ? kinOf(world, selectedPerson) : null;
  const thought = world && selectedPerson ? mind(world, selectedPerson) : "";
  const selectedCiv =
    sel?.kind === "civ" ? world?.civs.find((c) => c.id === sel.id) : selectedPerson ? world?.civs.find((c) => c.id === selectedPerson.civId) : undefined;
  const logs = world?.logs.slice(0, 18) ?? [];

  const pointer = useRef<{ id: number; x: number; y: number; camX: number; camY: number; angle: number; moved: boolean } | null>(null);
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  let watchLine = "";
  if (world && planet && screen === "planeta") {
    let bestName = "";
    let bestTask = "";
    let bestD = 1e9;
    for (const p of world.people) {
      if (!p.alive || p.planet !== planet.id) continue;
      const d = Math.hypot(wrapDelta(p.x - camRef.current.x), p.y - camRef.current.y);
      if (d < bestD) {
        bestD = d;
        bestName = p.name.split(" ")[0] ?? p.name;
        bestTask = p.task === "nada" ? "no hace nada que importe" : `está en ${p.task}`;
      }
    }
    watchLine = bestName ? `${bestName} ${bestTask}. ` : "";
  }

  return (
    <div className="flex h-dvh flex-col bg-cave-deep text-bone">
      <header className="z-10 flex items-start justify-between gap-3 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none text-bone">Dos Cuevas</h1>
          <p className="mt-1 text-[11px] leading-snug text-bone-dim">Tierra, y los mundos que no piden permiso.</p>
          <p className="text-[11px] text-gold">
            Sistema vivo · día {ready ? Math.floor(day / 24) + 1 : "—"} · hora {ready ? ((day % 24) + 24) % 24 : "—"} · {ready ? (day % 24 >= 20 || day % 24 < 6 ? "noche" : day % 24 < 9 ? "alba" : "luz") : ""}
            {planet && screen !== "sistema" ? ` · ${planet.name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1" aria-label="Mirada">
            <Eye className="size-3.5 text-gold" />
            <Pip on={attention > 0} />
            <Pip on={attention > 1} />
            <Pip on={attention > 2} />
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded-full bg-cave px-2 py-1 text-[11px] ring-1 ring-line"
              onClick={() => applySpeed(speed === 0 ? heldRef.current : 0)}
              aria-label={speed === 0 ? "Reanudar" : "Pausa"}
            >
              {speed === 0 ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>
            {[1, 8, 32].map((n) => (
              <button
                key={n}
                type="button"
                className={`rounded-full px-2 py-1 text-[11px] ring-1 ${speed === n ? "bg-gold text-cave-deep ring-gold" : "bg-cave text-bone ring-line"}`}
                onClick={() => applySpeed(n)}
              >
                {n}×
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={(e) => {
            audioRef.current?.unlock();
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            fingers.current.set(e.pointerId, { x, y });
            pointer.current = {
              id: e.pointerId,
              x,
              y,
              camX: camRef.current.x,
              camY: camRef.current.y,
              angle: worldRef.current?.angle ?? 0,
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, { x, y });
            if (fingers.current.size >= 2 && screenRef.current === "planeta") {
              const pts = [...fingers.current.values()];
              const dist = Math.hypot((pts[0]?.x ?? 0) - (pts[1]?.x ?? 0), (pts[0]?.y ?? 0) - (pts[1]?.y ?? 0));
              if (!pinchRef.current) pinchRef.current = { dist: Math.max(12, dist), zoom: camRef.current.zoom };
              else camRef.current.zoom = clamp(pinchRef.current.zoom * (dist / pinchRef.current.dist), 8, 40);
              if (pointer.current) pointer.current.moved = true;
              return;
            }
            const drag = pointer.current;
            const current = worldRef.current;
            if (!drag || drag.id !== e.pointerId || !current) return;
            const dx = x - drag.x;
            const dy = y - drag.y;
            if (Math.hypot(dx, dy) > 6) drag.moved = true;
            if (!drag.moved) return;
            followRef.current = null;
            if (screenRef.current === "planeta") {
              camRef.current.x = drag.camX - dx / camRef.current.zoom;
              camRef.current.y = drag.camY - dy / camRef.current.zoom;
            } else current.angle = drag.angle + dx * 0.006;
          }}
          onPointerUp={(e) => {
            fingers.current.delete(e.pointerId);
            if (fingers.current.size < 2) pinchRef.current = null;
            const drag = pointer.current;
            const current = worldRef.current;
            if (drag?.id === e.pointerId) pointer.current = null;
            if (!drag || drag.id !== e.pointerId || !current || drag.moved) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (screenRef.current !== "planeta") {
              const id = hitPlanet(current, rect.width, rect.height, x, y);
              if (id != null) openPlanet(id);
              return;
            }
            const hit = hitActor(current, camRef.current, rect.width, rect.height, x, y);
            if (!hit) return;
            if (hit.person != null) {
              selRef.current = { kind: "person", id: hit.person };
              followRef.current = hit.person;
              setSel(selRef.current);
            } else if (hit.fauna != null) {
              selRef.current = { kind: "fauna", id: hit.fauna };
              followRef.current = null;
              setSel(selRef.current);
            } else if (hit.civ != null) {
              selRef.current = { kind: "civ", id: hit.civ };
              current.focusCiv = hit.civ;
              setSel(selRef.current);
            }
            sync();
          }}
          onPointerCancel={(e) => {
            fingers.current.delete(e.pointerId);
            if (fingers.current.size < 2) pinchRef.current = null;
            if (pointer.current?.id === e.pointerId) pointer.current = null;
          }}
          onWheel={(e) => {
            if (screenRef.current !== "planeta") return;
            camRef.current.zoom = clamp(camRef.current.zoom * (e.deltaY > 0 ? 0.9 : 1.12), 8, 40);
          }}
        />

        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-end p-4">
            <p className="text-sm text-bone-dim">El sistema abre los ojos…</p>
          </div>
        )}

        {ready && !coached && screen === "sistema" && (
          <div className="absolute inset-x-3 bottom-24 z-20 rounded-2xl bg-cave/95 p-4 ring-1 ring-line">
            <p className="font-display text-lg">Mira, no mandes.</p>
            <p className="mt-1 text-sm text-bone-dim">
              Toca un mundo. La crónica son otras vidas. La mirada tuerce un día, no una guerra.
            </p>
            <button type="button" className="mt-3 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-cave-deep" onClick={dismissCoach}>
              Entendido
            </button>
          </div>
        )}

        {screen === "planeta" && (
          <div className="absolute right-3 bottom-[7.5rem] flex flex-col gap-1">
            <button type="button" className="min-h-11 min-w-11 rounded-full bg-cave text-base ring-1 ring-line" onClick={() => (camRef.current.zoom = clamp(camRef.current.zoom * 1.2, 8, 40))}>
              +
            </button>
            <button type="button" className="min-h-11 min-w-11 rounded-full bg-cave text-base ring-1 ring-line" onClick={() => (camRef.current.zoom = clamp(camRef.current.zoom / 1.2, 8, 40))}>
              −
            </button>
          </div>
        )}
      </div>

      <section className="z-10 max-h-[38dvh] overflow-y-auto border-t border-line bg-cave px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex gap-1">
          {(
            [
              ["sistema", "Sistema", Orbit],
              ["planeta", "Planeta", Eye],
              ["cronica", "Crónica", ScrollText],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-xs font-semibold ${screen === id ? "bg-moss text-cave-deep" : "bg-cave-deep text-bone ring-1 ring-line"}`}
              onClick={() => {
                if (id === "planeta" && worldRef.current) openPlanet(worldRef.current.focusPlanet);
                else goScreen(id);
              }}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {screen === "cronica" && (
          <ul className="space-y-1.5">
            {logs.length === 0 && <li className="text-sm text-bone-dim">Todavía no pasa nada que merezca tinta.</li>}
            {logs.map((entry, i) => (
              <li key={`${entry.day}-${i}`} className={`text-sm ${entry.tone === "sangre" ? "text-rust" : entry.tone === "oro" ? "text-gold" : "text-bone-dim"}`}>
                <span className="text-bone">Día {entry.day}. </span>
                {entry.text}
              </li>
            ))}
          </ul>
        )}

        {screen === "planeta" && !selectedPerson && sel?.kind !== "fauna" && sel?.kind !== "civ" && (
          <p className="text-sm leading-snug text-bone">
            {watchLine}Tocá a alguien para oír lo que piensa. Una casa se abre con «Ver dentro», no con un golpe.
          </p>
        )}

        {screen !== "cronica" && selectedPerson && kin && (
          <div>
            <p className="font-display text-lg leading-tight">{selectedPerson.name}</p>
            <p className="text-xs text-bone-dim">
              {ROLE_LABEL[selectedPerson.role]} · {selectedCiv?.name} · {ageWord(selectedPerson)}
            </p>
            <p className="mt-1 text-sm leading-snug text-bone">“{thought}”</p>
            <p className="text-xs text-bone-dim">{blurb(selectedPerson)}</p>
            <p className="text-xs text-bone-dim">
              Oficio {looks(selectedPerson).job}
              {looks(selectedPerson).mark > 0 ? " · lleva una marca en la piel" : " · la piel está limpia"}
              {" · "}
              {["pelo oscuro", "pelo castaño", "pelo rubio", "pelo negro", "pelo rojo", "pelo cano"][looks(selectedPerson).hair]}
              {" · ropa "}
              {["de musgo", "de óxido", "de río", "de trigo", "de vino", "de cuero"][looks(selectedPerson).cloth]}
            </p>
            <p className="mt-1 text-xs text-bone-dim">
              Padres:{" "}
              {kin.mother || kin.father ? (
                <>
                  {kin.mother ? (
                    <button type="button" className="text-gold underline" onClick={() => { selRef.current = { kind: "person", id: kin.mother!.id }; followRef.current = kin.mother!.id; setSel(selRef.current); }}>
                      {kin.mother.name}
                    </button>
                  ) : "—"}
                  {kin.father && kin.father.id !== kin.mother?.id ? (
                    <>
                      {" · "}
                      <button type="button" className="text-gold underline" onClick={() => { selRef.current = { kind: "person", id: kin.father!.id }; followRef.current = kin.father!.id; setSel(selRef.current); }}>
                        {kin.father.name}
                      </button>
                    </>
                  ) : null}
                </>
              ) : (
                "no guarda sus nombres."
              )}
            </p>
            <p className="text-xs text-bone-dim">
              Hijos:{" "}
              {kin.children.length === 0
                ? "ninguno todavía."
                : kin.children.slice(0, 6).map((c, i) => (
                    <span key={c.id}>
                      {i > 0 ? " · " : ""}
                      <button type="button" className="text-gold underline" onClick={() => { selRef.current = { kind: "person", id: c.id }; followRef.current = c.id; setSel(selRef.current); }}>
                        {c.name}
                        {!c.alive ? " †" : ""}
                      </button>
                    </span>
                  ))}
            </p>
            <div className="mt-2 flex gap-1">
              <button type="button" className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-cave-deep" onClick={() => act("favor")}>
                <Eye className="mr-1 inline size-3.5" /> Favor
              </button>
              <button type="button" className="rounded-full bg-cave-deep px-3 py-1.5 text-xs ring-1 ring-line" onClick={() => act("escudo")}>
                <Shield className="mr-1 inline size-3.5" /> Escudo
              </button>
            </div>
          </div>
        )}

        {screen !== "cronica" && !selectedPerson && selectedFauna && (
          <div>
            <p className="font-display text-lg leading-tight">{selectedFauna.name}</p>
            <p className="mt-1 text-sm leading-snug text-bone">{beastLine(selectedFauna.kind)}</p>
            <p className="text-xs text-bone-dim">
              {selectedFauna.kind === "presa" ? "Huye si hay gente." : selectedFauna.kind === "ave" ? "Vuela, también sobre el agua." : selectedFauna.kind === "alien" ? "No es de este suelo." : "Acecha."}
              {" "}· vida {Math.round(selectedFauna.hp)}
            </p>
          </div>
        )}

        {screen !== "cronica" && !selectedPerson && sel?.kind !== "fauna" && selectedCiv && (
          <div>
            <p className="font-display text-lg leading-tight">{selectedCiv.name}</p>
            <p className="text-xs text-bone-dim">
              {eraName(selectedCiv.kind, selectedCiv.era)} · {LAW_LABEL[selectedCiv.law]} · {KIND_LABEL[selectedCiv.kind]}
            </p>
            <p className="mt-1 text-xs text-bone-dim">
              Gente {Math.round(selectedCiv.pop)} · grano {Math.round(selectedCiv.food)} · miedo {Math.round(selectedCiv.fear)} · orden {Math.round(selectedCiv.order)} · saber {Math.round(selectedCiv.knowledge)}
            </p>
            {world?.works
              .filter((w) => w.civId === selectedCiv.id && !w.done)
              .slice(0, 2)
              .map((w) => (
                <p key={w.id} className="text-xs text-gold">
                  Levantan {WORK_NAME[w.kind]} · {w.progress}/{w.need}
                </p>
              ))}
            <p className="text-xs text-bone-dim">
              {civsHere
                .filter((c) => c.id !== selectedCiv.id)
                .map((c) => `${c.name}: ${relWord(selectedCiv.relations[c.id] ?? 0)}`)
                .join(" · ")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button type="button" className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-cave-deep" onClick={() => { selRef.current = { kind: "civ", id: selectedCiv.id }; setSel(selRef.current); act("rumor"); }}>
                <MessageCircle className="mr-1 inline size-3.5" /> Rumor
              </button>
              <button type="button" className="rounded-full bg-cave-deep px-3 py-1.5 text-xs ring-1 ring-line" onClick={() => { selRef.current = { kind: "civ", id: selectedCiv.id }; setSel(selRef.current); act("chispa"); }}>
                <Sparkles className="mr-1 inline size-3.5" /> Chispa
              </button>
              {planet?.sites
                .filter((s) => s.civId === selectedCiv.id)
                .slice(0, 1)
                .map((s) => (
                  <button
                    key={`${s.x}-${s.y}`}
                    type="button"
                    className="rounded-full bg-cave-deep px-3 py-1.5 text-xs ring-1 ring-line"
                    onClick={() => {
                      const room = { x: s.x, y: s.y, civId: s.civId };
                      insideRef.current = insideRef.current ? null : room;
                      setInside(insideRef.current);
                      goScreen("planeta");
                    }}
                  >
                    {inside ? "Volver al mapa" : "Ver dentro"}
                  </button>
                ))}
            </div>
          </div>
        )}

        {screen === "sistema" && (
          <div className="mt-2 flex flex-wrap gap-1">
            {world?.planets.map((p) => (
              <button key={p.id} type="button" className="rounded-full bg-cave-deep px-2 py-1 text-[11px] ring-1 ring-line" onClick={() => openPlanet(p.id)}>
                {p.name}
                <span className="text-bone-dim"> · {KIND_LABEL[p.kind]}</span>
              </button>
            ))}
          </div>
        )}

        {screen === "planeta" && civsHere.length > 0 && (
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {civsHere.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] ring-1 ${selectedCiv?.id === c.id ? "bg-moss text-cave-deep ring-moss" : "bg-cave-deep ring-line"}`}
                onClick={() => {
                  selRef.current = { kind: "civ", id: c.id };
                  if (worldRef.current) worldRef.current.focusCiv = c.id;
                  followRef.current = null;
                  setSel(selRef.current);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {note && <p className="mt-2 text-xs text-rust">{note}</p>}

        <div className="mt-2">
          {!confirmNew ? (
            <button type="button" className="text-[11px] text-bone-dim underline" onClick={() => setConfirmNew(true)}>
              Otro sistema
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[11px]">
              <span>¿Dejas este cielo atrás?</span>
              <button type="button" className="rounded-full bg-rust px-2 py-1 font-semibold text-bone" onClick={another}>
                Sí
              </button>
              <button type="button" className="rounded-full px-2 py-1 ring-1 ring-line" onClick={() => setConfirmNew(false)}>
                No
              </button>
            </div>
          )}
        </div>
      </section>
      <span className="hidden">{rev}</span>
    </div>
  );
}

declare global {
  interface Window {
    __cosmos?: {
      setKeys: (partial: Partial<Keys>) => void;
      getCam: () => Cam;
      getDay: () => number;
      getLogs: () => string[];
      ready: boolean;
    };
  }
}
