import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Category } from '../domain/types';

interface Props {
  category: Category;
  size?: number;
  color: string;
}

export function CategoryIcon({ category, size = 44, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {renderCategory(category, color)}
    </Svg>
  );
}

function renderCategory(category: Category, color: string) {
  const strokeProps = {
    stroke: color,
    strokeWidth: 2.4,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  switch (category) {
    case 'top':
      return (
        <Path
          d="M12 18 L24 12 L32 18 L40 12 L52 18 L48 28 L42 26 L42 54 L22 54 L22 26 L16 28 Z"
          {...strokeProps}
        />
      );
    case 'bottom':
      return (
        <Path
          d="M20 10 L44 10 L46 32 L40 54 L34 54 L32 34 L30 54 L24 54 L18 32 Z"
          {...strokeProps}
        />
      );
    case 'shoes':
      return (
        <Path
          d="M8 44 L10 38 L18 34 L26 34 L30 30 L42 30 L50 40 L56 42 L56 48 L8 48 Z M22 42 L24 48 M32 42 L34 48 M42 42 L44 48"
          {...strokeProps}
        />
      );
    case 'hat':
      return (
        <>
          <Path
            d="M10 46 L54 46"
            {...strokeProps}
          />
          <Path
            d="M18 46 C18 28 24 18 32 18 C40 18 46 28 46 46"
            {...strokeProps}
          />
          <Path
            d="M20 40 L44 40"
            {...strokeProps}
          />
        </>
      );
    case 'accessory':
      return (
        <>
          <Rect x={26} y={8} width={12} height={8} rx={2} {...strokeProps} />
          <Rect x={26} y={48} width={12} height={8} rx={2} {...strokeProps} />
          <Circle cx={32} cy={32} r={13} {...strokeProps} />
          <Path d="M32 24 L32 32 L38 34" {...strokeProps} />
        </>
      );
    case 'outerwear':
      return (
        <>
          <Path
            d="M16 16 L24 10 L28 18 L36 18 L40 10 L48 16 L50 30 L44 30 L44 54 L20 54 L20 30 L14 30 Z"
            {...strokeProps}
          />
          <Path d="M32 18 L32 54" {...strokeProps} />
          <Circle cx={36} cy={28} r={0.9} fill={color} stroke="none" />
          <Circle cx={36} cy={36} r={0.9} fill={color} stroke="none" />
          <Circle cx={36} cy={44} r={0.9} fill={color} stroke="none" />
        </>
      );
    default:
      return null;
  }
}
