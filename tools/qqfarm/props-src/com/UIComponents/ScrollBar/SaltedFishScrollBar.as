package com.UIComponents.ScrollBar
{
   import fl.core.UIComponent;
   import flash.display.DisplayObject;
   import flash.display.MovieClip;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.geom.Rectangle;
   import flash.utils.getDefinitionByName;
   
   public class SaltedFishScrollBar extends UIComponent
   {
      
      private var startY:Number;
      
      private var bg:MovieClip;
      
      private var speed:Number = 10;
      
      private var _thiswidth:Number;
      
      private var container:Sprite;
      
      private var up_btn:SimpleButton;
      
      private var myMask:MovieClip;
      
      private var _thisheight:Number;
      
      private var down_btn:SimpleButton;
      
      private var handler:MovieClip;
      
      private var rectangle:Rectangle;
      
      private var target:DisplayObject;
      
      public function SaltedFishScrollBar()
      {
         super();
         _thiswidth = this.width;
         _thisheight = this.height;
      }
      
      private function enterFrameHandler(param1:Event) : void
      {
         target.y = startY - (handler.y - up_btn.y - up_btn.height) / (bg.height - down_btn.height - up_btn.height - handler.height) * (target.height - myMask.height);
      }
      
      public function set effectObject(param1:String) : void
      {
         target = this.parent.getChildByName(param1);
         if(target != null)
         {
            startY = target.y;
            init();
            parent.addEventListener(MouseEvent.MOUSE_WHEEL,wheelHandler);
         }
         else
         {
            trace("传入的对象非显示对象");
         }
      }
      
      private function wheelHandler(param1:MouseEvent) : void
      {
         var overflow:Number = target.height - myMask.height;
         var travel:Number = bg.height - down_btn.height - up_btn.height - handler.height;
         if(overflow <= 0 || travel <= 0)
         {
            return;
         }
         var top:Number = up_btn.y + up_btn.height;
         handler.y = Math.max(top,Math.min(top + travel,handler.y - param1.delta * 30 * travel / overflow));
         enterFrameHandler(null);
         param1.stopPropagation();
      }
      
      private function downClickHandler(param1:MouseEvent) : void
      {
         var _loc2_:Number = NaN;
         _loc2_ = down_btn.y - (handler.y + handler.height);
         if(_loc2_ == 0)
         {
            return;
         }
         if(_loc2_ > speed)
         {
            handler.y += speed;
            target.y -= target.height * (speed / (bg.height - down_btn.height - up_btn.height));
         }
         else
         {
            handler.y = down_btn.y - handler.height;
            target.y -= target.height * (_loc2_ / (bg.height - down_btn.height - up_btn.height));
         }
      }
      
      private function createClip(param1:String) : MovieClip
      {
         var clip:MovieClip = null;
         var classMc:* = undefined;
         var className:String = param1;
         try
         {
            classMc = getDefinitionByName(className);
            clip = new classMc() as MovieClip;
         }
         catch(e:ReferenceError)
         {
            trace("找不到" + className + "类");
         }
         return clip;
      }
      
      private function mouseOutHandler(param1:MouseEvent) : void
      {
         handler.stopDrag();
         stage.removeEventListener(MouseEvent.MOUSE_UP,mouseUpHandler);
         handler.removeEventListener(MouseEvent.MOUSE_OUT,mouseOutHandler);
         this.removeEventListener(Event.ENTER_FRAME,enterFrameHandler);
      }
      
      private function upClickHandler(param1:MouseEvent) : void
      {
         var _loc2_:Number = NaN;
         _loc2_ = handler.y - (up_btn.y + up_btn.height);
         if(_loc2_ == 0)
         {
            return;
         }
         if(_loc2_ > speed)
         {
            handler.y -= speed;
            target.y += (target.height - myMask.height) * (speed / (bg.height - down_btn.height - up_btn.height - handler.height));
         }
         else
         {
            handler.y = up_btn.y + up_btn.height;
            target.y += (target.height - myMask.height) * (_loc2_ / (bg.height - down_btn.height - up_btn.height - handler.height));
         }
      }
      
      private function init() : void
      {
         if(container == null)
         {
            container = new Sprite();
            addChild(container);
         }
         if(bg == null)
         {
            bg = createClip("bg");
            container.addChild(bg);
         }
         if(handler == null)
         {
            handler = createClip("handler");
            handler.buttonMode = true;
            container.addChild(handler);
         }
         if(up_btn == null)
         {
            up_btn = createButton("up");
            container.addChild(up_btn);
         }
         if(down_btn == null)
         {
            down_btn = createButton("down");
            container.addChild(down_btn);
         }
         if(myMask == null)
         {
            myMask = createClip("mask");
            container.addChild(myMask);
         }
         target.mask = myMask;
         addListen();
         adjustment();
      }
      
      private function mouseUpHandler(param1:MouseEvent) : void
      {
         handler.stopDrag();
         stage.removeEventListener(MouseEvent.MOUSE_UP,mouseUpHandler);
         handler.removeEventListener(MouseEvent.MOUSE_OUT,mouseOutHandler);
         this.removeEventListener(Event.ENTER_FRAME,enterFrameHandler);
      }
      
      private function handlerClickHandler(param1:MouseEvent) : void
      {
         handler.startDrag(false,new Rectangle(bg.x,up_btn.y + up_btn.height,0,bg.height - up_btn.height - down_btn.height - handler.height));
         handler.x = bg.x;
         stage.addEventListener(MouseEvent.MOUSE_UP,mouseUpHandler);
         this.addEventListener(Event.ENTER_FRAME,enterFrameHandler);
      }
      
      private function createButton(param1:String) : SimpleButton
      {
         var clip:SimpleButton = null;
         var classMc:* = undefined;
         var className:String = param1;
         try
         {
            classMc = getDefinitionByName(className);
            clip = new classMc() as SimpleButton;
         }
         catch(e:ReferenceError)
         {
            trace("找不到" + className + "类");
         }
         return clip;
      }
      
      private function removeListen() : void
      {
         up_btn.removeEventListener(MouseEvent.CLICK,upClickHandler);
         down_btn.removeEventListener(MouseEvent.CLICK,downClickHandler);
         bg.removeEventListener(MouseEvent.CLICK,bgClickHandler);
         handler.removeEventListener(MouseEvent.MOUSE_DOWN,handlerClickHandler);
      }
      
      private function adjustment() : void
      {
         myMask.width = _thiswidth;
         myMask.height = _thisheight;
         bg.height = _thisheight;
         bg.x = myMask.x + _thiswidth - bg.width;
         bg.y = myMask.y;
         up_btn.x = myMask.x + _thiswidth - bg.width;
         up_btn.y = myMask.y;
         down_btn.x = myMask.x + _thiswidth - bg.width;
         down_btn.y = myMask.y + _thisheight - down_btn.height;
         handler.x = up_btn.x;
         handler.y = up_btn.y + up_btn.height;
         if(target.height < myMask.height)
         {
            handler.visible = false;
            up_btn.visible = false;
            down_btn.visible = false;
            bg.visible = false;
            removeListen();
         }
         else
         {
            handler.visible = true;
            up_btn.visible = true;
            down_btn.visible = true;
            bg.visible = true;
            addListen();
            handler.height = myMask.height / target.height * (_thisheight - up_btn.height - down_btn.height);
         }
      }
      
      private function bgClickHandler(param1:MouseEvent) : void
      {
         if(this.mouseY - up_btn.y - up_btn.height < handler.height / 2)
         {
            handler.y = up_btn.y + up_btn.height;
         }
         else if(down_btn.y - this.mouseY < handler.height / 2)
         {
            handler.y = down_btn.y - handler.height;
         }
         else
         {
            handler.y = this.mouseY - handler.height / 2;
         }
         target.y = -(handler.y - up_btn.y - up_btn.height) / (bg.height - down_btn.height - up_btn.height - handler.height) * (target.height - myMask.height);
      }
      
      public function change() : void
      {
         trace(target.height);
         if(target.height < myMask.height)
         {
            handler.visible = false;
            up_btn.visible = false;
            down_btn.visible = false;
            bg.visible = false;
            removeListen();
         }
         else
         {
            handler.height = myMask.height / target.height * (_thisheight - up_btn.height - down_btn.height);
         }
      }
      
      private function addListen() : void
      {
         up_btn.addEventListener(MouseEvent.CLICK,upClickHandler);
         down_btn.addEventListener(MouseEvent.CLICK,downClickHandler);
         bg.addEventListener(MouseEvent.CLICK,bgClickHandler);
         handler.addEventListener(MouseEvent.MOUSE_DOWN,handlerClickHandler);
      }
   }
}

