"use client"

import { Check, ChevronsUpDown } from "lucide-react"
import * as React from "react"

import { Button } from "~/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"

export function StatesSelector({ states, setStates }) {
  const [open, setOpen] = React.useState(false)

  const selectedStates = states.filter(state => state.selected)
  const selectedText = selectedStates.length > 0 
    ? selectedStates.map(s => s.name).join(", ")
    : "Select states..."

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between"
        >
          {selectedText}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Command>
          <CommandInput placeholder="Search states..." />
          <CommandList>
            <CommandEmpty>No states found.</CommandEmpty>
            <CommandGroup>
              {states.map((state) => (
                <CommandItem
                  key={state.name}
                  onSelect={() => {
                    setStates(prevStates => 
                      prevStates.map(s => ({
                        ...s,
                        selected: s.name === state.name ? !s.selected : s.selected
                      }))
                    )
                  }}
                >
                  {state.name}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      state.selected ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
