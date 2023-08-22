function $(id: string): HTMLElement {
    return document.getElementById(id);
}

function $$(selector: string): HTMLElement[] {
    return Array.from(document.querySelectorAll(selector));
}

function create(tag: string, properties?: { [key: string]: any }, content?: string | HTMLElement | HTMLElement[]): HTMLElement {
    const elem = document.createElement(tag);

    if (properties !== undefined) {
        for (const key in properties) {
            if (key.startsWith('@'))
                elem.addEventListener(key.substring(1), properties[key]);
            else
                elem.setAttribute(key, properties[key]);
        }
    }

    if (content !== undefined) {
        if (typeof (content) === 'string') elem.innerHTML = content;
        if (content instanceof HTMLElement) elem.append(content);
        if (Array.isArray(content)) for (const child of content) elem.append(child);
    }

    return elem;
}

function clear(elem: HTMLElement): void {
    elem.innerHTML = '';
}

function onClick(elem: HTMLElement, f: (this: HTMLElement, ev: MouseEvent) => any): void {
    elem.addEventListener('click', f);
}

function onMouseDown(elem: HTMLElement, f: (this: HTMLElement, ev: MouseEvent) => any): void {
    elem.addEventListener('mousedown', f);
}

function onMouseUp(elem: HTMLElement, f: (this: HTMLElement, ev: MouseEvent) => any): void {
    elem.addEventListener('mouseup', f);
}

function onMouseMove(elem: HTMLElement, f: (this: HTMLElement, ev: MouseEvent) => any): void {
    elem.addEventListener('mousemove', f);
}

function onWheel(elem: HTMLElement, f: (this: HTMLElement, ev: WheelEvent) => any): void {
    elem.addEventListener('wheel', f);
}

function onContextMenu(elem: HTMLElement, f: (this: HTMLElement, ev: MouseEvent) => any): void {
    elem.addEventListener('contextmenu', f);
}

function onChange(elem: HTMLElement, f: (this: HTMLElement, ev: Event) => any): void {
    elem.addEventListener('change', f);
}

function onInput(elem: HTMLElement, f: (this: HTMLElement, ev: Event) => any): void {
    elem.addEventListener('input', f);
}

function onRightClick(elem: HTMLElement, f: (this: HTMLElement, ev: MouseEvent) => any): void {
    elem.addEventListener('contextmenu', f);
}

function onKeyPress(elem: HTMLElement, f: (this: HTMLElement, ev: KeyboardEvent) => any): void {
    elem.addEventListener('keypress', f);
}

function onKeyDown(elem: HTMLElement, f: (this: HTMLElement, ev: KeyboardEvent) => any): void {
    elem.addEventListener('keydown', f);
}

function onKeyUp(elem: HTMLElement, f: (this: HTMLElement, ev: KeyboardEvent) => any): void {
    elem.addEventListener('keyup', f);
}

function onDrop(elem: HTMLElement, f: (this: HTMLElement, ev: DragEvent) => any): void {
    elem.addEventListener('drop', f);
}

function onDragOver(elem: HTMLElement, f: (this: HTMLElement, ev: DragEvent) => any): void {
    elem.addEventListener('dragover', f);
}

function addClass(elem: HTMLElement, c: string): void {
    elem.classList.add(c);
}

function removeClass(elem: HTMLElement, c: string): void {
    elem.classList.remove(c);
}

function hasClass(elem: HTMLElement, c: string): boolean {
    return elem.classList.contains(c);
}

function toggleClass(elem: HTMLElement, c: string): void {
    hasClass(elem, c) ? removeClass(elem, c) : addClass(elem, c);
}

function setHTML(elem: HTMLElement, html: string): void {
    elem.innerHTML = html;
}

function setText(elem: HTMLElement, text: string): void {
    elem.innerText = text;
}

function requestGET(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(this.responseText); };
        xhr.onerror = reject;
        xhr.open('GET', url);
        xhr.send();
    });
}

function requestPOST(url: string, data: string | object): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(this.responseText); };
        xhr.onerror = reject;
        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(typeof data === 'string' ? data : JSON.stringify(data));
    });
}

function requestHEAD(url: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(this.status == 200); };
        xhr.onerror = reject;
        xhr.open('HEAD', url);
        xhr.send();
    });
}

function cssVariable(name: string): string {
    return getComputedStyle(document.body).getPropertyValue(name);
}

function setCookie(name: string, value: string, days: number): void {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
}

function getCookie(name: string): string {
    const cookies = decodeURIComponent(document.cookie).split(';');
    const needle = `${name}=`;
    for (let c of cookies) {
        while (c.charAt(0) == ' ')
            c = c.substring(1);
        if (c.indexOf(needle) == 0)
            return c.substring(needle.length, c.length);
    }
    return null;
}
