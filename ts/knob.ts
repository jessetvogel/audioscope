type KnobType = 'lin' | 'exp';

class KnobElement extends HTMLElement {
    _min: number;
    _max: number;
    _position: number; // [0..1]
    _dragging: boolean;
    _dragInfo: { id: number, x: number, y: number, position: number };
    _type: KnobType;
    _onChange: (knob: KnobElement) => void;

    constructor() {
        super();

        const min = this.getAttribute('min');
        this._min = (min !== null) ? parseFloat(min) : 0.0;
        const max = this.getAttribute('max');
        this._max = (max !== null) ? parseFloat(max) : 1.0;
        const type = this.getAttribute('type');
        this._type = (type === 'lin' || type === 'exp') ? type : 'lin';
        this._position = 0.0;
        const value = this.getAttribute('value');
        if (value !== null)
            this.value = parseFloat(value);
        this._onChange = null;

        this.addEventListener('pointerdown', (event) => this._dragStart(event));
        this.ownerDocument.addEventListener('pointermove', (event) => this._dragMove(event));
        this.ownerDocument.addEventListener('pointerup', (event) => this._dragEnd(event));

        this._updateRotation();
    }

    get value(): number {
        switch (this._type) {
            case 'lin': return this._min + (this._max - this._min) * this._position;
            case 'exp': return this._min * Math.exp(this._position * Math.log(this._max / this._min));
        }
    }

    set value(value: number) {
        switch (this._type) {
            case 'lin': this._setPosition((value - this._min) / (this._max - this._min)); break;
            case 'exp': this._setPosition(Math.log(value / this._min) / Math.log(this._max / this._min)); break;
        }
    }

    get type(): KnobType {
        return this._type;
    }

    set type(type: string) {
        if (type === 'lin' || type === 'exp') {
            const value = this.value;
            this._type = type;
            this.value = value;
        }
    }

    set onChange(callback: (knob: KnobElement) => void) {
        this._onChange = callback;
    }

    _setPosition(x: number): void {
        x = Math.min(1.0, Math.max(0.0, x)); // clamp to [0..1]
        if (this._position == x)
            return;

        this._position = x;
        this._updateRotation();
        this._onChange?.(this);
    }

    _updateRotation(): void {
        const angle = -135 + 270 * this._position;
        this.style.transform = `rotate(${angle}deg)`;
    }

    _dragStart(event: PointerEvent): void {
        if (event.pointerType === 'mouse' && event.button !== 0) // only listen to left mouse button
            return;

        if (!this._dragging) {
            this._dragging = true;
            this.classList.add('dragging');
            this._dragInfo = { id: event.pointerId, x: event.x, y: event.y, position: this._position };
        }
    }

    _dragMove(event: PointerEvent): void {
        if (this._dragging && event.pointerId == this._dragInfo.id) {
            // const angle = Math.atan2(event.x - (this.offsetLeft + this.offsetWidth / 2), - (event.y - (this.offsetTop + this.offsetHeight / 2))) / Math.PI * 180.0;
            const dy = event.y - this._dragInfo.y;
            const dx = event.x - this._dragInfo.x;
            this._setPosition(this._dragInfo.position - dy / 128.0 + dx / 512.0);
            this._dragInfo.x = event.x;
            this._dragInfo.y = event.y;
            this._dragInfo.position = this._position;
        }
    }

    _dragEnd(event: PointerEvent): void {
        if (this._dragging && event.pointerId == this._dragInfo.id) {
            this._dragging = false;
            this.classList.remove('dragging');
        }
    }
}

customElements.define('x-knob', KnobElement);
