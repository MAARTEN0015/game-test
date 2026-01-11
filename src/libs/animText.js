/**
 * animText.js
 */

export class AnimText {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.color = '';
        this.scale = 0;
        this.startScale = 0;
        this.maxScale = 0;
        this.scaleSpeed = 0;
        this.speed = 0;
        this.life = 0;
        this.text = '';
    }

    init(x, y, scale, speed, life, text, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.scale = scale;
        this.startScale = this.scale;
        this.maxScale = scale * 1.5;
        this.scaleSpeed = 0.7;
        this.speed = speed;
        this.life = life;
        this.text = text;
    }

    update(delta) {
        if (this.life) {
            this.life -= delta;
            this.y -= this.speed * delta;
            this.scale += this.scaleSpeed * delta;
            
            if (this.scale >= this.maxScale) {
                this.scale = this.maxScale;
                this.scaleSpeed *= -1;
            } else if (this.scale <= this.startScale) {
                this.scale = this.startScale;
                this.scaleSpeed = 0;
            }
            
            if (this.life <= 0) {
                this.life = 0;
            }
        }
    }

    render(ctxt, xOff, yOff) {
        ctxt.fillStyle = this.color;
        ctxt.font = this.scale + "px Hammersmith One";
        ctxt.fillText(this.text, this.x - xOff, this.y - yOff);
    }
}

export class TextManager {
    constructor() {
        this.texts = [];
    }

    update(delta, ctxt, xOff, yOff) {
        ctxt.textBaseline = "middle";
        ctxt.textAlign = "center";
        
        for (let i = 0; i < this.texts.length; ++i) {
            if (this.texts[i].life) {
                this.texts[i].update(delta);
                this.texts[i].render(ctxt, xOff, yOff);
            }
        }
    }

    showText(x, y, scale, speed, life, text, color) {
        let tmpText;
        
        for (let i = 0; i < this.texts.length; ++i) {
            if (!this.texts[i].life) {
                tmpText = this.texts[i];
                break;
            }
        }
        
        if (!tmpText) {
            tmpText = new AnimText(); 
            this.texts.push(tmpText);
        }
        
        tmpText.init(x, y, scale, speed, life, text, color);
    }
}