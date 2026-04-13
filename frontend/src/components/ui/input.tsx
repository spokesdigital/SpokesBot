import { cn } from "@/lib/utils"

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg"
}

export function Input({
  className,
  variant = "default",
  size = "default",
  ...props
}: InputProps) {
  const inputVariants = cn(
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-file placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    variant === "default" && "",
    variant === "outline" && "border border-input hover:bg-muted",
    variant === "ghost" && "hover:bg-muted",
    size === "default" && "h-10 py-2 px-3 text-sm",
    size === "sm" && "h-9 px-2 text-xs",
    size === "lg" && "h-11 px-3 text-base",
    className
  )

  return (
    <input
      className={inputVariants}
      {...props}
    />
  )
}
