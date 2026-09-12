import type { ReactElement, ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Toggle } from "@base-ui/react/toggle";
import { Select } from "@base-ui/react/select";
import { Tooltip } from "@base-ui/react/tooltip";
import { Toast } from "@base-ui/react/toast";
import { Icon } from "./Icon";
import "./ui.css";

export { Dialog } from "@base-ui/react/dialog";
export { Input } from "@base-ui/react/input";
export { Tabs } from "@base-ui/react/tabs";

// Keep the Base UI composition and ref API available to every consumer.
export type ButtonProps = BaseButton.Props & { static?: boolean };

export function Button({
  className,
  static: isStatic = false,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      data-static={isStatic || undefined}
      className={(state) =>
        `ui-button ${typeof className === "function" ? className(state) : (className ?? "")}`
      }
    />
  );
}

function Hint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup className="ui-tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function IconButton({
  label,
  className,
  ...props
}: Omit<ButtonProps, "className"> & {
  label: string;
  className?: string;
}) {
  return (
    <Hint label={label}>
      <Button
        {...props}
        aria-label={label}
        className={`icon-button ${className ?? ""}`}
      />
    </Hint>
  );
}

export function ToggleButton({
  label,
  children,
  static: isStatic = false,
  ...props
}: Toggle.Props & { label: string; static?: boolean }) {
  return (
    <Hint label={label}>
      <Toggle
        {...props}
        data-static={isStatic || undefined}
        aria-label={label}
        className="ui-button tool-button"
      >
        {children}
      </Toggle>
    </Hint>
  );
}

export function SelectControl({
  label,
  disabled,
  value,
  onValueChange,
  items,
}: {
  label: string;
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  items: { label: string; value: string }[];
}) {
  return (
    <Select.Root
      disabled={disabled}
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <Select.Trigger
        data-static
        className="ui-button ui-select"
        aria-label={label}
      >
        <Select.Value />
        <Select.Icon>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m3 4.5 3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="ui-positioner"
          sideOffset={6}
          align="start"
          alignItemWithTrigger={false}
        >
          <Select.Popup className="ui-select-popup">
            <Select.List>
              {items.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  className="ui-select-item"
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Icon name="check" size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function useNotifications() {
  const manager = Toast.useToastManager();
  return {
    success: (title: string, action?: { label: string; onClick: () => void | Promise<void> }) => {
      let pending = false;
      const id = manager.add({ title, type: "success", ...(action ? { timeout: 12000, actionProps: { children: action.label, onClick: async () => {
        if (pending) return;
        pending = true;
        try { await action.onClick(); manager.close(id); }
        catch (error) { manager.add({ title: error instanceof Error ? error.message : 'The action could not finish. Try again.', type: 'error', timeout: 0, priority: 'high' }); }
        finally { pending = false; }
      } } } : {}) });
      return id;
    },
    error: (title: string) =>
      manager.add({ title, type: "error", timeout: 0, priority: "high" }),
  };
}

function Notifications() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="ui-notifications">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="ui-notification"
            data-kind={toast.type}
          >
            <Toast.Content>
              <Toast.Title className="ui-notification-title" />
              {toast.actionProps && <Toast.Action render={<Button className="text-button notification-action" />} />}
            </Toast.Content>
            <Toast.Close
              aria-hidden={false}
              aria-label="Dismiss notification"
              render={
                <Button
                  className="icon-button"
                  aria-label="Dismiss notification"
                />
              }
            >
              <Icon name="close" size={14} />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function UiProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delay={500}>
      <Toast.Provider limit={3}>
        {children}
        <Notifications />
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
