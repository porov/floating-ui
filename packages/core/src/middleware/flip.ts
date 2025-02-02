import {
  detectOverflow,
  Options as DetectOverflowOptions,
} from '../detectOverflow';
import type {Middleware, Placement} from '../types';
import {getAlignmentSides} from '../utils/getAlignmentSides';
import {getExpandedPlacements} from '../utils/getExpandedPlacements';
import {getOppositeAxisPlacements} from '../utils/getOppositeAxisPlacements';
import {getOppositePlacement} from '../utils/getOppositePlacement';
import {getSide} from '../utils/getSide';

export interface Options {
  /**
   * The axis that runs along the side of the floating element.
   * @default true
   */
  mainAxis: boolean;
  /**
   * The axis that runs along the alignment of the floating element.
   * @default true
   */
  crossAxis: boolean;
  /**
   * Placements to try if the preferred `placement` does not fit.
   * @default [oppositePlacement] (computed)
   */
  fallbackPlacements: Array<Placement>;
  /**
   * What strategy to use when no placements fit.
   * @default 'bestFit'
   */
  fallbackStrategy: 'bestFit' | 'initialPlacement';
  /**
   * Whether to allow fallback to the opposite axis, and if so, which
   * side direction of the axis to prefer.
   * @default 'none' (disallow fallback)
   */
  fallbackAxisSideDirection: 'none' | 'start' | 'end';
  /**
   * Whether to flip to placements with the opposite alignment if they fit
   * better.
   * @default true
   */
  flipAlignment: boolean;
}

/**
 * Changes the placement of the floating element to one that will fit if the
 * initially specified `placement` does not.
 * @see https://floating-ui.com/docs/flip
 */
export const flip = (
  options: Partial<Options & DetectOverflowOptions> = {}
): Middleware => ({
  name: 'flip',
  options,
  async fn(middlewareArguments) {
    const {
      placement,
      middlewareData,
      rects,
      initialPlacement,
      platform,
      elements,
    } = middlewareArguments;

    const {
      mainAxis: checkMainAxis = true,
      crossAxis: checkCrossAxis = true,
      fallbackPlacements: specifiedFallbackPlacements,
      fallbackStrategy = 'bestFit',
      fallbackAxisSideDirection = 'none',
      flipAlignment = true,
      ...detectOverflowOptions
    } = options;

    const side = getSide(placement);
    const isBasePlacement = getSide(initialPlacement) === initialPlacement;
    const rtl = await platform.isRTL?.(elements.floating);

    const fallbackPlacements =
      specifiedFallbackPlacements ||
      (isBasePlacement || !flipAlignment
        ? [getOppositePlacement(initialPlacement)]
        : getExpandedPlacements(initialPlacement));

    if (!specifiedFallbackPlacements && fallbackAxisSideDirection !== 'none') {
      fallbackPlacements.push(
        ...getOppositeAxisPlacements(
          initialPlacement,
          flipAlignment,
          fallbackAxisSideDirection,
          rtl
        )
      );
    }

    const placements = [initialPlacement, ...fallbackPlacements];

    const overflow = await detectOverflow(
      middlewareArguments,
      detectOverflowOptions
    );

    const overflows = [];
    let overflowsData = middlewareData.flip?.overflows || [];

    if (checkMainAxis) {
      overflows.push(overflow[side]);
    }

    if (checkCrossAxis) {
      const {main, cross} = getAlignmentSides(placement, rects, rtl);
      overflows.push(overflow[main], overflow[cross]);
    }

    overflowsData = [...overflowsData, {placement, overflows}];

    // One or more sides is overflowing.
    if (!overflows.every((side) => side <= 0)) {
      const nextIndex = (middlewareData.flip?.index || 0) + 1;
      const nextPlacement = placements[nextIndex];

      if (nextPlacement) {
        // Try next placement and re-run the lifecycle.
        return {
          data: {
            index: nextIndex,
            overflows: overflowsData,
          },
          reset: {
            placement: nextPlacement,
          },
        };
      }

      // First, try to use the one that fits on mainAxis side of overflow.
      let resetPlacement = overflowsData.find(
        (d) => d.overflows[0] <= 0
      )?.placement;

      // Otherwise fallback.
      if (!resetPlacement) {
        switch (fallbackStrategy) {
          case 'bestFit': {
            const placement = overflowsData
              .map(
                (d) =>
                  [
                    d.placement,
                    d.overflows
                      .filter((overflow) => overflow > 0)
                      .reduce((acc, overflow) => acc + overflow, 0),
                  ] as const
              )
              .sort((a, b) => a[1] - b[1])[0]?.[0];
            if (placement) {
              resetPlacement = placement;
            }
            break;
          }
          case 'initialPlacement':
            resetPlacement = initialPlacement;
            break;
          default:
        }
      }

      if (placement !== resetPlacement) {
        return {
          reset: {
            placement: resetPlacement,
          },
        };
      }
    }

    return {};
  },
});
