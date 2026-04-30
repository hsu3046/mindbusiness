import { cn } from "@/lib/utils"
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'

function Spinner({ className }: { className?: string }) {
  return (
    <HugeiconsIcon icon={Loading03Icon} className={cn("h-4 w-4 animate-spin", className)} />
  )
}

export { Spinner }
