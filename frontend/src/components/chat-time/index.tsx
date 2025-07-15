export const ChatTime = ({ time }: { time: string | number | Date }) => {
  const date = new Date(time);
  let hours = date.getHours();
  const pm = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) {
    hours -= 12;
  } else if (hours === 0) {
    hours = 12;
  }
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return (
    <div className="chat-timestamp">
      {hours}:{minutes} {pm}
    </div>
  );
};
