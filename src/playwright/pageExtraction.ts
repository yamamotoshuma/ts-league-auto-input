import type { FormSnapshot, RawControl, RawTable, TableSnapshot } from "../domain/types";
import type { Page } from "playwright";

export async function extractPageTables(page: Page): Promise<TableSnapshot> {
  return page.evaluate(() => {
    function normalizeText(value: string | null | undefined): string {
      return (value ?? "").replace(/\s+/g, " ").trim();
    }

    function extractControls(cell: Element, rowIndex: number, cellIndex: number): RawControl[] {
      return Array.from(cell.querySelectorAll("input, select, textarea")).map((control, controlIndex) => {
        const input = control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        return {
          tagName: control.tagName.toLowerCase(),
          type: "type" in input ? input.type ?? null : null,
          name: input.getAttribute("name"),
          id: input.getAttribute("id"),
          value: "value" in input ? input.value ?? null : null,
          rowIndex,
          cellIndex,
          controlIndex,
          placeholder: input.getAttribute("placeholder"),
        };
      });
    }

    function extractTable(table: HTMLTableElement, tableIndex: number): RawTable {
      let headers: string[] = [];
      const rows: RawTable["rows"] = [];

      Array.from(table.querySelectorAll("tr")).forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
        if (cells.length === 0) {
          return;
        }

        const extractedCells = cells.map((cell, cellIndex) => ({
          text: normalizeText(cell.textContent),
          controls: extractControls(cell, rowIndex, cellIndex),
        }));

        const hasControls = extractedCells.some((cell) => cell.controls.length > 0);
        const hasHeaderCell = cells.some((cell) => cell.tagName.toLowerCase() === "th");
        const texts = extractedCells.map((cell) => cell.text);

        if (headers.length === 0 && (hasHeaderCell || (!hasControls && texts.some(Boolean)))) {
          headers = texts;
          return;
        }

        rows.push({
          rowIndex,
          cells: extractedCells,
        });
      });

      return {
        tableIndex,
        caption: normalizeText(table.querySelector("caption")?.textContent),
        headers,
        rows,
      };
    }

    const tables = Array.from(document.querySelectorAll("table")).map((table, tableIndex) =>
      extractTable(table as HTMLTableElement, tableIndex),
    );

    return {
      url: window.location.href,
      title: document.title,
      tables,
    };
  });
}

export async function extractForms(page: Page): Promise<FormSnapshot[]> {
  return page.evaluate(() => {
    function normalizeText(value: string | null | undefined): string {
      return (value ?? "").replace(/\s+/g, " ").trim();
    }

    function extractControls(root: ParentNode, rowIndex: number, cellIndex: number): RawControl[] {
      return Array.from(root.querySelectorAll("input, select, textarea")).map((control, controlIndex) => {
        const input = control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        return {
          tagName: control.tagName.toLowerCase(),
          type: "type" in input ? input.type ?? null : null,
          name: input.getAttribute("name"),
          id: input.getAttribute("id"),
          value: "value" in input ? input.value ?? null : null,
          rowIndex,
          cellIndex,
          controlIndex,
          placeholder: input.getAttribute("placeholder"),
        };
      });
    }

    function extractTable(table: HTMLTableElement, tableIndex: number): RawTable {
      let headers: string[] = [];
      const rows: RawTable["rows"] = [];

      Array.from(table.querySelectorAll("tr")).forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
        if (cells.length === 0) {
          return;
        }

        const extractedCells = cells.map((cell, cellIndex) => ({
          text: normalizeText(cell.textContent),
          controls: extractControls(cell, rowIndex, cellIndex),
        }));

        const hasControls = extractedCells.some((cell) => cell.controls.length > 0);
        const hasHeaderCell = cells.some((cell) => cell.tagName.toLowerCase() === "th");
        const texts = extractedCells.map((cell) => cell.text);

        if (headers.length === 0 && (hasHeaderCell || (!hasControls && texts.some(Boolean)))) {
          headers = texts;
          return;
        }

        rows.push({
          rowIndex,
          cells: extractedCells,
        });
      });

      return {
        tableIndex,
        caption: normalizeText(table.querySelector("caption")?.textContent),
        headers,
        rows,
      };
    }

    return Array.from(document.querySelectorAll("form")).map((form, formIndex) => {
      const formElement = form as HTMLFormElement;
      const tables = Array.from(formElement.querySelectorAll("table")).map((table, tableIndex) =>
        extractTable(table as HTMLTableElement, tableIndex),
      );
      const looseControls = extractControls(formElement, -1, -1);

      return {
        formIndex,
        action: formElement.getAttribute("action"),
        method: formElement.getAttribute("method"),
        tables,
        looseControls,
      };
    });
  });
}

