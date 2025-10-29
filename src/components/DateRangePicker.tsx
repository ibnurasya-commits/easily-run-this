import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DateRangePickerProps {
  date: DateRange | undefined;
  onDateChange: (date: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  date,
  onDateChange,
  className,
}: DateRangePickerProps) {
  const [startMonth, setStartMonth] = React.useState<string>(
    date?.from ? format(date.from, "yyyy-MM") : ""
  );
  const [endMonth, setEndMonth] = React.useState<string>(
    date?.to ? format(date.to, "yyyy-MM") : ""
  );

  // Generate months from 2024-01 to 2026-12
  const months = React.useMemo(() => {
    const result: string[] = [];
    for (let year = 2024; year <= 2026; year++) {
      for (let month = 1; month <= 12; month++) {
        result.push(`${year}-${String(month).padStart(2, '0')}`);
      }
    }
    return result;
  }, []);

  const handleStartMonthChange = (value: string) => {
    setStartMonth(value);
    const from = new Date(value + "-01");
    const to = endMonth ? new Date(endMonth + "-01") : from;
    onDateChange({ from, to });
  };

  const handleEndMonthChange = (value: string) => {
    setEndMonth(value);
    const from = startMonth ? new Date(startMonth + "-01") : new Date(value + "-01");
    const to = new Date(value + "-01");
    onDateChange({ from, to });
  };

  const formatMonthLabel = (monthStr: string) => {
    if (!monthStr) return "";
    const date = new Date(monthStr + "-01");
    return format(date, "MMM yyyy");
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {startMonth && endMonth ? (
              <>
                {formatMonthLabel(startMonth)} - {formatMonthLabel(endMonth)}
              </>
            ) : (
              <span>Pick month range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Month</label>
              <Select value={startMonth} onValueChange={handleStartMonthChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select start month" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonthLabel(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Month</label>
              <Select value={endMonth} onValueChange={handleEndMonthChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select end month" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonthLabel(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
