"use client";

import { useReducedMotion } from "motion/react";
import { Component, useEffect, useState, type ReactNode } from "react";

import { IGRA_MOTION, loadIgraPlugin, type IgraPlugins } from "@/lib/igra-motion";
import { rankOrderChanged } from "@/lib/igra-leaderboard";

type FlipApi = IgraPlugins["Flip"];
type FlipState = ReturnType<FlipApi["getState"]>;

const ITEMS = "[data-flip-id]";
const FLIP_SECONDS = 0.5;

type ListProps = { ids: readonly string[]; flip: FlipApi | null; className?: string; children: ReactNode };

/**
 * Klasa zbog `getSnapshotBeforeUpdate`: to je jedini trenutak u kom DOM još stoji po
 * STAROM redosledu, a nova lista je već izračunata. Stanje uhvaćeno tada ne zavisi od
 * skrola između dva osvežavanja, pa redovi ne „odlete" kad se strana u međuvremenu pomeri.
 */
class FlipOrderList extends Component<ListProps> {
  private list: HTMLOListElement | null = null;
  private readonly setList = (node: HTMLOListElement | null) => {
    this.list = node;
  };

  getSnapshotBeforeUpdate(previous: Readonly<ListProps>): FlipState | null {
    const { flip, ids } = this.props;
    if (!flip || !this.list || document.hidden || !rankOrderChanged(previous.ids, ids)) return null;
    return flip.getState(this.list.querySelectorAll(ITEMS));
  }

  componentDidUpdate(_previous: Readonly<ListProps>, _state: unknown, snapshot: FlipState | null) {
    const { flip } = this.props;
    if (!snapshot || !flip || !this.list) return;
    flip.from(snapshot, {
      targets: this.list.querySelectorAll(ITEMS),
      duration: FLIP_SECONDS,
      ease: IGRA_MOTION.ease.out,
      simple: true,
    });
  }

  componentWillUnmount() {
    if (this.list) this.props.flip?.killFlipsOf(this.list.querySelectorAll(ITEMS));
  }

  render() {
    return (
      <ol ref={this.setList} className={this.props.className}>
        {this.props.children}
      </ol>
    );
  }
}

/**
 * Lista čiji redovi menjaju mesta kroz GSAP Flip (K12): kad osvežen upit promeni redosled,
 * svaki red klizne sa starog mesta na novo umesto da skoči. Redovi nose `data-flip-id`.
 * Flip se skida lenjo (`loadIgraPlugin`) i samo uz dozvoljen pokret; dok ne stigne, ili uz
 * smanjen pokret, redovi samo stanu na novo mesto.
 */
export function FlipOrder({ ids, className, children }: { ids: readonly string[]; className?: string; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const [flip, setFlip] = useState<FlipApi | null>(null);

  useEffect(() => {
    if (reduced) return;
    let alive = true;
    loadIgraPlugin("Flip")
      .then((plugin) => {
        if (alive) setFlip(() => plugin);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [reduced]);

  return (
    <FlipOrderList ids={ids} flip={reduced ? null : flip} className={className}>
      {children}
    </FlipOrderList>
  );
}
