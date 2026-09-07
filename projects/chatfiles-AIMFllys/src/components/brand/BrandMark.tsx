import type { SVGProps } from 'react'
import { brandMarkPaths, brandMarkViewBox } from './brandGeometry'

type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, 'title'> & { title?: string }

export function BrandMark({ title = '午夜书斋', ...props }: BrandMarkProps) {
  return (
    <svg aria-label={title} role="img" viewBox={brandMarkViewBox} {...props}>
      <title>{title}</title>
      {brandMarkPaths.map((path) => <path d={path} key={path} />)}
    </svg>
  )
}
